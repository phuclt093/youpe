import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { biliUrlFromId } from './bili';
import { isYtdlpAvailable, ytdlpBin } from './ytdlp';
import type { VideoItem } from './types';

const run = promisify(execFile);

/**
 * Duyệt Bilibili.tv: trang chủ, tìm kiếm, danh sách tập.
 *
 * Bilibili.tv không công bố API. Các đường dẫn dưới đây là những gì trang web của họ
 * tự gọi (và yt-dlp cũng gọi cho phần danh sách tập), nên có thể đổi bất cứ lúc nào.
 * Vì thế ở đây làm theo ba nguyên tắc:
 *
 * 1. **Không tin vào cấu trúc cố định.** Thay vì đọc `data.items[0].xxx` theo một
 *    khuôn, `collect()` đi khắp cây JSON và nhặt mọi thứ trông giống một thẻ video
 *    (có tiêu đề, có ảnh, có id tập / phần / video). Họ đổi chỗ đặt dữ liệu thì vẫn
 *    nhặt được.
 * 2. **Thử nhiều đường.** Mỗi việc có vài đường dẫn ứng viên, cái nào ra dữ liệu thì
 *    dùng. Riêng danh sách tập có đường lùi chắc chắn là yt-dlp.
 * 3. **Có đường gỡ lỗi.** `/api/bili/debug` trả nguyên văn phản hồi của từng đường
 *    dẫn, để khi có gì lệch thì biết ngay họ đang trả cái gì.
 */

const API = 'https://api.bilibili.tv/intl/gateway';
const LOCALE = process.env.BILI_LOCALE?.trim() || 'vi_VN';
const LANG = LOCALE.split('_')[0] || 'vi';

type Raw = { url: string; ok: boolean; status: number; body: any; error?: string };

export async function biliGet(path: string, params: Record<string, string> = {}): Promise<Raw> {
  const u = new URL(API + path);
  u.searchParams.set('s_locale', LOCALE);
  u.searchParams.set('platform', 'web');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const url = u.toString();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        Accept: 'application/json',
        Referer: `https://www.bilibili.tv/${LANG}/`,
        Origin: 'https://www.bilibili.tv',
      },
    });
    const body = await r.json().catch(() => null);
    // API của họ trả HTTP 200 kèm `code` khác 0 khi có lỗi
    const ok = r.ok && body && (body.code === undefined || body.code === 0);
    return { url, ok: !!ok, status: r.status, body };
  } catch (e: any) {
    return { url, ok: false, status: 0, body: null, error: e?.message ?? String(e) };
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ */
/* Nhặt thẻ video ra khỏi một cây JSON bất kỳ                           */
/* ------------------------------------------------------------------ */

const str = (v: any) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const digits = (v: any) => (/^\d+$/.test(str(v)) ? str(v) : '');

/** Ảnh của bilibili hay trả dạng `//...` hoặc http — chuẩn hoá thành https */
function img(v: any): string {
  const s = str(v);
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  return s.replace(/^http:\/\//, 'https://');
}

/** Bỏ thẻ <em> mà kết quả tìm kiếm dùng để tô từ khoá */
const clean = (s: string) => s.replace(/<[^>]+>/g, '').trim();

function toItem(n: any): VideoItem | null {
  if (!n || typeof n !== 'object') return null;

  const title = clean(
    str(n.title) || str(n.title_display) || str(n.long_title_display) || str(n.name)
  );
  const cover = img(n.cover ?? n.horizontal_cover ?? n.vertical_cover ?? n.pic ?? n.thumbnail);
  if (!title || !cover) return null;

  const season = digits(n.season_id);
  const ep = digits(n.episode_id ?? n.ep_id);
  const aid = digits(n.aid ?? n.av_id);

  let id = '';
  if (season && ep) id = `bili_p_${season}_${ep}`;
  else if (season) id = `bili_p_${season}`;
  else if (aid) id = `bili_v_${aid}`;
  else {
    // một số thẻ chỉ có đường dẫn web
    const m = str(n.url ?? n.link ?? n.jump_url).match(/\/(video|play)\/(\d+)(?:\/(\d+))?/);
    if (m) id = m[1] === 'video' ? `bili_v_${m[2]}` : m[3] ? `bili_p_${m[2]}_${m[3]}` : `bili_p_${m[2]}`;
  }
  if (!id) return null;

  const sub =
    clean(str(n.index_show) || str(n.styles) || str(n.view) || str(n.play) || str(n.desc)) || '';

  return {
    id,
    title,
    thumbnail: cover,
    durationSec: null,
    durationText: str(n.duration_text ?? n.duration_display ?? '') || '',
    viewsText: sub,
    publishedText: '',
    isLive: false,
    author: {
      id: '',
      name: clean(str(n.author ?? n.author_name ?? n.uploader ?? n.up_name ?? '')),
      avatar: img(n.face ?? n.avatar ?? ''),
      verified: false,
    },
  };
}

export function collect(root: any, limit = 60): VideoItem[] {
  const out: VideoItem[] = [];
  const seen = new Set<string>();
  const stack: any[] = [root];
  let guard = 0;

  while (stack.length && out.length < limit && guard++ < 30000) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;

    if (!Array.isArray(n)) {
      const it = toItem(n);
      if (it && !seen.has(it.id)) {
        seen.add(it.id);
        out.push(it);
        continue; // thẻ rồi thì không đào vào trong nữa
      }
    }

    const kids = Array.isArray(n) ? n : Object.values(n);
    for (let i = kids.length - 1; i >= 0; i--) {
      if (kids[i] && typeof kids[i] === 'object') stack.push(kids[i]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Các việc cụ thể                                                      */
/* ------------------------------------------------------------------ */

type Tried = { url: string; status: number; note: string };

async function firstWith(
  candidates: [string, Record<string, string>][],
  limit: number
): Promise<{ items: VideoItem[]; tried: Tried[] }> {
  const tried: Tried[] = [];
  for (const [path, params] of candidates) {
    const r = await biliGet(path, params);
    const items = r.ok ? collect(r.body?.data ?? r.body, limit) : [];
    tried.push({
      url: r.url,
      status: r.status,
      note: r.error ?? (r.ok ? `${items.length} mục` : `code ${r.body?.code ?? '?'}: ${r.body?.message ?? ''}`),
    });
    if (items.length) return { items, tried };
  }
  return { items: [], tried };
}

export function searchPaths(q: string, page = 1): [string, Record<string, string>][] {
  const pn = String(page);
  return [
    ['/web/v2/search_result', { keyword: q, pn, ps: '40' }],
    ['/web/v2/search_v2', { keyword: q, pn, ps: '40' }],
    ['/web/v2/search', { keyword: q, pn, ps: '40' }],
  ];
}

export function homePaths(page = 1): [string, Record<string, string>][] {
  const pn = String(page);
  const paged: [string, Record<string, string>][] = [
    ['/web/v2/home/recommend', { pn, ps: '40' }],
    ['/web/v2/ogv/index/feed', { pn, ps: '40' }],
  ];
  // lịch phát sóng không có trang 2 — chỉ gộp vào ở trang đầu
  return page === 1
    ? [...paged, ['/web/v2/home/timeline', {}], ['/web/v2/anime/timeline', {}]]
    : paged;
}

/**
 * Gộp kết quả của MỌI đường dẫn thay vì dừng ở cái đầu tiên có dữ liệu.
 *
 * Trước đây trang chủ chỉ lấy từ một nguồn — thường là lịch phát sóng, vốn chỉ có
 * chục phim — nên nhìn rất nghèo. Gọi song song rồi trộn xen kẽ thì vừa nhiều hơn,
 * vừa không bị một nguồn chiếm hết mấy hàng đầu.
 */
async function mergeAll(
  candidates: [string, Record<string, string>][],
  limit: number
): Promise<{ items: VideoItem[]; tried: Tried[] }> {
  const rs = await Promise.all(candidates.map(([p, params]) => biliGet(p, params)));
  const lists = rs.map((r) => (r.ok ? collect(r.body?.data ?? r.body, limit) : []));
  const tried: Tried[] = rs.map((r, i) => ({
    url: r.url,
    status: r.status,
    note: r.error ?? (r.ok ? `${lists[i].length} mục` : `code ${r.body?.code ?? '?'}`),
  }));

  const out: VideoItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < limit; i++) {
    let any = false;
    for (const l of lists) {
      const v = l[i];
      if (!v) continue;
      any = true;
      if (!seen.has(v.id)) {
        seen.add(v.id);
        out.push(v);
      }
    }
    if (!any) break;
  }
  return { items: out, tried };
}

/*
  Tìm kiếm giờ được gọi nhiều (trang chủ làm đầy bằng 8 từ khoá mỗi lần), nên phải
  tiết kiệm:
  - nhớ đường dẫn nào chạy được để lần sau gọi thẳng, không thử lại từ đầu;
  - mọi đường dẫn đều hỏng (không phải "không có kết quả", mà là lỗi thật) thì nghỉ
    5 phút — không thì mỗi lần mở trang chủ là vài chục yêu cầu hỏng, mỗi cái chờ 8 giây.
*/
let searchWinner = -1;
let searchDeadUntil = 0;

export async function searchBili(q: string, page = 1): Promise<{ items: VideoItem[]; tried: Tried[] }> {
  if (Date.now() < searchDeadUntil) {
    return { items: [], tried: [{ url: 'search', status: 0, note: 'tạm bỏ qua — tìm kiếm vừa hỏng, thử lại sau ít phút' }] };
  }

  const paths = searchPaths(q, page);
  const order =
    searchWinner >= 0 ? [paths[searchWinner], ...paths.filter((_, i) => i !== searchWinner)] : paths;

  const r = await firstWith(order, 60);

  if (r.items.length) {
    const used = r.tried[r.tried.length - 1]?.url ?? '';
    searchWinner = paths.findIndex(([p]) => used.includes(p));
  } else if (!r.tried.some((t) => / mục$/.test(t.note))) {
    // không đường nào trả về được dữ liệu hợp lệ, kể cả danh sách rỗng
    searchDeadUntil = Date.now() + 5 * 60_000;
  }
  return r;
}

/**
 * Từ khoá dùng để làm đầy trang chủ khi các nguồn đề xuất trả về quá ít.
 *
 * Thực tế đo được: chỉ lịch phát sóng là trả dữ liệu, mà lịch thì chỉ có chục phim
 * đang ra tập mới và không có trang 2 — trang chủ nhìn rất nghèo, cuộn là hết. Tìm
 * theo vài thể loại phổ biến rồi trộn vào thì vừa nhiều phim, vừa cuộn tiếp được
 * (mỗi từ khoá có nhiều trang). Đổi danh sách bằng BILI_HOME_KEYWORDS, ngăn bằng dấu phẩy.
 */
const HOME_KEYWORDS = (
  process.env.BILI_HOME_KEYWORDS?.trim() ||
  'anime,hoạt hình trung quốc,tu tiên,chuyển sinh,phim trung quốc,hành động,tình cảm,hài hước'
)
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

/** Dưới mức này thì trang chủ coi như nghèo, phải làm đầy thêm */
const HOME_MIN = 40;

/** Trộn xen kẽ nhiều danh sách, bỏ trùng */
function weave(lists: VideoItem[][], limit: number, seen = new Set<string>()): VideoItem[] {
  const out: VideoItem[] = [];
  for (let i = 0; out.length < limit; i++) {
    let any = false;
    for (const l of lists) {
      const v = l[i];
      if (!v) continue;
      any = true;
      if (!seen.has(v.id)) {
        seen.add(v.id);
        out.push(v);
      }
    }
    if (!any) break;
  }
  return out;
}

export async function homeBili(page = 1): Promise<{ items: VideoItem[]; tried: Tried[] }> {
  // trang đầu: các nguồn đề xuất trước — chúng là "đề xuất thật" nên xếp lên đầu
  const base = page === 1 ? await mergeAll(homePaths(1), 120) : { items: [], tried: [] as Tried[] };
  if (page === 1 && base.items.length >= HOME_MIN) return base;

  /*
    Làm đầy bằng tìm kiếm theo thể loại. Trang chủ trang N dùng trang N của mỗi từ
    khoá — nên cuộn xuống là ra phim mới chứ không lặp lại mấy phim đầu.
    Gọi song song: tám từ khoá mà gọi lần lượt thì mất cả chục giây.
  */
  const found = await Promise.all(HOME_KEYWORDS.map((k) => searchBili(k, page)));
  const tried = [...base.tried, ...found.flatMap((f) => f.tried.slice(-1))];

  const seen = new Set(base.items.map((v) => v.id));
  const extra = weave(
    found.map((f) => f.items),
    120,
    seen
  );
  return { items: [...base.items, ...extra], tried };
}

export type Season = {
  id: string;
  title: string;
  episodes: VideoItem[];
  tried: Tried[];
};

/**
 * Danh sách tập của một phần phim.
 *
 * Đường API này chính là cái yt-dlp dùng (`/web/v2/ogv/play/episodes`), nên khả
 * năng đúng cao nhất. Hỏng thì hỏi thẳng yt-dlp bằng `--flat-playlist` — chậm hơn
 * vài giây nhưng yt-dlp được cập nhật liên tục theo trang của họ.
 */
export async function seasonBili(seasonId: string): Promise<Season> {
  const tried: Tried[] = [];

  const [eps, info] = await Promise.all([
    biliGet('/web/v2/ogv/play/episodes', { season_id: seasonId }),
    biliGet('/web/v2/ogv/play/season_info', { season_id: seasonId }),
  ]);
  tried.push({ url: eps.url, status: eps.status, note: eps.error ?? (eps.ok ? 'ok' : `code ${eps.body?.code}`) });

  const title =
    clean(str(info.body?.data?.season?.title ?? info.body?.data?.title ?? '')) || 'Danh sách tập';

  if (eps.ok) {
    const episodes: VideoItem[] = [];
    const sections: any[] = eps.body?.data?.sections ?? [];
    for (const sec of sections) {
      for (const e of sec?.episodes ?? []) {
        const ep = digits(e?.episode_id ?? e?.ep_id);
        if (!ep) continue;
        episodes.push({
          id: `bili_p_${seasonId}_${ep}`,
          title: clean(str(e.title_display) || str(e.long_title_display) || str(e.title) || `Tập ${ep}`),
          thumbnail: img(e.cover),
          durationSec: null,
          durationText: '',
          viewsText: '',
          publishedText: '',
          isLive: false,
          author: { id: '', name: title, avatar: '', verified: false },
        });
      }
    }
    // cấu trúc đổi mà vẫn có dữ liệu thì để bộ nhặt chung thử
    const list = episodes.length ? episodes : collect(eps.body?.data, 500);
    if (list.length) return { id: seasonId, title, episodes: list, tried };
  }

  // ---- đường lùi: yt-dlp ----
  if (await isYtdlpAvailable()) {
    try {
      const { stdout } = await run(
        ytdlpBin(),
        ['-J', '--flat-playlist', '--no-warnings', '--ignore-config', biliUrlFromId(`bili_p_${seasonId}`, LANG)],
        { timeout: 45_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
      );
      const j = JSON.parse(stdout);
      const episodes: VideoItem[] = (j.entries ?? [])
        .map((e: any): VideoItem | null => {
          const m = str(e.url ?? e.webpage_url).match(/\/play\/(\d+)\/(\d+)/);
          const ep = m?.[2] ?? digits(e.id);
          if (!ep) return null;
          return {
            id: `bili_p_${seasonId}_${ep}`,
            title: str(e.title) || `Tập ${ep}`,
            thumbnail: img(e.thumbnails?.[0]?.url ?? e.thumbnail ?? ''),
            durationSec: null,
            durationText: '',
            viewsText: '',
            publishedText: '',
            isLive: false,
            author: { id: '', name: str(j.title) || title, avatar: '', verified: false },
          };
        })
        .filter(Boolean) as VideoItem[];
      tried.push({ url: 'yt-dlp --flat-playlist', status: 200, note: `${episodes.length} tập` });
      if (episodes.length) return { id: seasonId, title: str(j.title) || title, episodes, tried };
    } catch (e: any) {
      tried.push({ url: 'yt-dlp --flat-playlist', status: 0, note: e?.message ?? 'lỗi' });
    }
  }

  return { id: seasonId, title, episodes: [], tried };
}
