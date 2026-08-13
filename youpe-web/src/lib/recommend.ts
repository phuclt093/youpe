import { collectVideos, videosFrom } from './innertube';
import type { VideoItem } from './types';

/**
 * Bộ trộn gợi ý.
 *
 * Vấn đề của cách cũ: chỉ tìm theo tiêu đề video đang xem, nên kết quả dồn hết về
 * cùng một kênh — xem một video của ai thì cả cột phải toàn người đó.
 *
 * Cách làm ở đây là trộn nhiều nguồn có bản chất khác nhau rồi xen kẽ theo trọng số,
 * đồng thời chặn trần số video mỗi kênh. Nhờ vậy vừa giữ được cái liên quan sát,
 * vừa mở ra chủ đề và xu hướng mới.
 */

export type Bucket = { source: string; weight: number; items: VideoItem[] };

const CHANNEL_CAP = 2; // mỗi kênh nhiều nhất bấy nhiêu video trong cả danh sách

/* ---------------- cache nhỏ dùng chung ---------------- */

type Entry = { at: number; items: VideoItem[] };
const cache = new Map<string, Entry>();

async function cached(key: string, ttlMs: number, run: () => Promise<VideoItem[]>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.items;

  const items = await run();
  cache.set(key, { at: Date.now(), items });
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  return items;
}

/* ---------------- tách từ khoá ---------------- */

/** Từ quá phổ biến, giữ lại chỉ làm nhiễu truy vấn */
const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'you', 'your', 'official',
  'video', 'full', 'hd', 'mv', 'new', 'best', 'top', 'how', 'what', 'why',
  'và', 'của', 'cho', 'với', 'những', 'một', 'các', 'là', 'có', 'không', 'người',
  'chính', 'thức', 'mới', 'nhất', 'hay', 'phần', 'tập', 'series', 'nhé', 'rồi',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[|\-–—_()[\]{}#"'’.,!?:;/\\]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** Rút vài cụm tìm kiếm từ một mớ tiêu đề — dùng cho phần dựa trên hành vi xem */
export function queriesFromTitles(titles: string[], max = 2): string[] {
  const freq = new Map<string, number>();

  for (const t of titles) {
    // mỗi tiêu đề chỉ tính một lần cho mỗi từ, tránh tiêu đề lặp từ chiếm ưu thế
    for (const w of new Set(tokenize(t))) freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .filter(([, n]) => n >= 2) // phải xuất hiện ở ít nhất 2 video mới coi là sở thích
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

/** Chọn ngẫu nhiên vài phần tử, để mỗi lần mở lại không ra y hệt nhau */
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < n) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

/* ---------------- gom từng nguồn ---------------- */

async function searchBucket(
  yt: any,
  query: string,
  source: string,
  weight: number
): Promise<Bucket> {
  const items = await cached(`s:${query}`, 10 * 60_000, async () => {
    const res = await yt.search(query, { type: 'video' });
    return videosFrom(res, 20);
  });
  return { source, weight, items };
}

async function trendingBucket(yt: any): Promise<Bucket> {
  const items = await cached('trending', 30 * 60_000, async () => {
    try {
      const res = await yt.actions.execute('/browse', { browseId: 'FEtrending', parse: true });
      return collectVideos(res, 30);
    } catch {
      return [];
    }
  });
  return { source: 'xu hướng', weight: 1, items };
}

/**
 * Video mới nhất của một kênh.
 *
 * Cache 15 phút vì trang chủ gọi cùng lúc cả chục kênh, và người ta mở lại trang
 * chủ liên tục — không cache thì mỗi lần vào là ngần ấy lượt gọi YouTube.
 */
async function channelBucketItems(yt: any, id: string): Promise<VideoItem[]> {
  return cached(`ch:${id}`, 15 * 60_000, async () => {
    try {
      const ch: any = await yt.getChannel(id);
      const tab = await ch.getVideos();
      return videosFrom(tab, 8);
    } catch {
      // Kênh bị xoá hay đổi id thì bỏ qua, đừng để một kênh hỏng chặn cả trang chủ
      return [];
    }
  });
}

/* ---------------- xen kẽ ---------------- */

/**
 * Lấy luân phiên từ các nguồn, nguồn nào trọng số cao thì tới lượt nhiều hơn.
 * Vừa đi vừa chặn trần mỗi kênh và loại trùng.
 */
function interleave(buckets: Bucket[], limit: number, excludeIds: Set<string>): VideoItem[] {
  const out: VideoItem[] = [];
  const seen = new Set(excludeIds);
  const perChannel = new Map<string, number>();
  const cursor = new Map<string, number>();

  // nguồn trọng số 3 xuất hiện 3 lần trong một vòng, trọng số 1 thì một lần
  const order: Bucket[] = [];
  const maxWeight = Math.max(...buckets.map((b) => b.weight), 1);
  for (let w = maxWeight; w >= 1; w--) {
    for (const b of buckets) if (b.weight >= w) order.push(b);
  }

  let guard = 0;
  while (out.length < limit && guard++ < limit * 20) {
    let moved = false;

    for (const b of order) {
      if (out.length >= limit) break;

      let i = cursor.get(b.source) ?? 0;
      while (i < b.items.length) {
        const v = b.items[i++];
        if (!v || seen.has(v.id)) continue;

        const ch = v.author.id || v.author.name || '?';
        if ((perChannel.get(ch) ?? 0) >= CHANNEL_CAP) continue;

        seen.add(v.id);
        perChannel.set(ch, (perChannel.get(ch) ?? 0) + 1);
        out.push(v);
        moved = true;
        break;
      }
      cursor.set(b.source, i);
    }

    if (!moved) break; // hết hàng ở mọi nguồn
  }

  return out;
}

/* ---------------- điểm vào ---------------- */

export type RelatedResult = {
  videos: VideoItem[];
  mix: { source: string; count: number }[];
};

export async function buildRelated(
  yt: any,
  info: any,
  id: string,
  opts: { seedTitles?: string[]; watchedIds?: string[]; limit?: number } = {}
): Promise<RelatedResult> {
  const limit = opts.limit ?? 24;

  // 1. Gợi ý của chính YouTube — sát nội dung nhất, ưu tiên cao nhất
  const watchNext: Bucket = {
    source: 'youtube',
    weight: 3,
    items: collectVideos(info?.watch_next_feed ?? [], 30),
  };

  // 2. Chủ đề: lấy từ keywords của video, còn không thì từ tiêu đề
  const keywords: string[] = info?.basic_info?.keywords ?? [];
  const title: string = info?.basic_info?.title ?? '';
  const topics = keywords.length ? sample(keywords, 3) : sample(tokenize(title), 2);

  // 3. Hành vi: từ khoá lặp lại trong các video vừa xem
  const behaviour = queriesFromTitles(opts.seedTitles ?? [], 2);

  const jobs: Promise<Bucket>[] = [
    ...topics.map((t) => searchBucket(yt, t, `chủ đề: ${t}`, 2)),
    ...behaviour.map((t) => searchBucket(yt, t, `bạn hay xem: ${t}`, 2)),
    trendingBucket(yt),
  ];

  const settled = await Promise.allSettled(jobs);
  const buckets: Bucket[] = [watchNext];
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.items.length) buckets.push(s.value);
  }

  // Không loại hẳn video đã xem, chỉ loại video đang xem — người ta vẫn hay xem lại
  const exclude = new Set<string>([id]);

  const videos = interleave(buckets, limit, exclude);

  // đánh dấu nguồn của từng video để hiện ra hoặc gỡ lỗi
  const mix = buckets
    .map((b) => ({
      source: b.source,
      count: videos.filter((v) => b.items.some((i) => i.id === v.id)).length,
    }))
    .filter((m) => m.count > 0);

  return { videos, mix };
}

/**
 * Trang chủ theo người dùng.
 *
 * Feed chủ của YouTube khi không đăng nhập chỉ là một mớ đang thịnh hành — mở
 * youpe ra toàn video chẳng liên quan gì tới thứ mình theo dõi. Ở đây trộn ba
 * nguồn theo trọng số:
 *
 *   3  kênh đăng ký    video mới của những kênh mình theo
 *   2  bạn hay xem     tìm theo từ khoá lặp lại trong lịch sử xem
 *   1  khám phá        feed chung, để không đóng khung trong cái đã biết
 *
 * Trần mỗi kênh (`CHANNEL_CAP`) vẫn áp dụng, nên đăng ký một kênh đăng dày cũng
 * không chiếm hết trang.
 *
 * Chưa đăng ký kênh nào và chưa có lịch sử thì hàm này trả rỗng, nơi gọi tự quay
 * về feed chung — trang chủ của người mới không nên trống trơn.
 */
export async function buildHome(
  yt: any,
  fallback: VideoItem[],
  opts: { channelIds?: string[]; seedTitles?: string[]; watchedIds?: string[]; limit?: number } = {}
): Promise<RelatedResult> {
  const limit = opts.limit ?? 40;
  const channelIds = opts.channelIds ?? [];
  const behaviour = queriesFromTitles(opts.seedTitles ?? [], 2);

  if (!channelIds.length && !behaviour.length) return { videos: [], mix: [] };

  /*
    Chỉ hỏi tối đa 10 kênh, và **chọn ngẫu nhiên** trong số đã đăng ký.
    Lấy 10 kênh đầu theo thứ tự thì ai đăng ký 50 kênh sẽ mãi mãi chỉ thấy 10 cái
    đầu bảng chữ cái. Lấy mẫu ngẫu nhiên thì mỗi lần mở lại là một lát cắt khác.
  */
  const picked = sample(channelIds, 10);

  const subItems = (await Promise.allSettled(picked.map((id) => channelBucketItems(yt, id))))
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  const buckets: Bucket[] = [];
  if (subItems.length) buckets.push({ source: 'kênh đăng ký', weight: 3, items: subItems });

  const searched = await Promise.allSettled(
    behaviour.map((t) => searchBucket(yt, t, `bạn hay xem: ${t}`, 2))
  );
  for (const s of searched) {
    if (s.status === 'fulfilled' && s.value.items.length) buckets.push(s.value);
  }

  /*
    Chưa có nguồn cá nhân nào ra video thì bỏ cuộc, để nơi gọi trả feed chung.

    Không có nhánh này thì khi kênh đăng ký lỗi hết và tìm kiếm không ra gì, hàm
    vẫn trả về đúng feed chung nhưng gắn nhãn "đã cá nhân hoá" — dòng "Trộn từ:
    khám phá" hiện lên trong khi chẳng trộn gì cả.
  */
  if (!buckets.length) return { videos: [], mix: [] };

  if (fallback.length) buckets.push({ source: 'khám phá', weight: 1, items: fallback });

  /*
    Loại video đã xem khỏi trang chủ — khác hẳn màn hình gợi ý bên cạnh trình
    phát, nơi xem lại là chuyện thường. Trang chủ mà toàn thứ vừa xem xong thì
    chẳng còn là trang khám phá nữa.
  */
  const videos = interleave(buckets, limit, new Set(opts.watchedIds ?? []));

  const mix = buckets
    .map((b) => ({
      source: b.source,
      count: videos.filter((v) => b.items.some((i) => i.id === v.id)).length,
    }))
    .filter((m) => m.count > 0);

  return { videos, mix };
}
