import { Innertube, UniversalCache } from 'youtubei.js';
import type { VideoItem, ChannelItem, CommentItem } from './types';

let _yt: Promise<Innertube> | null = null;

export function getYT(): Promise<Innertube> {
  if (!_yt) {
    _yt = Innertube.create({
      lang: process.env.YT_LANG || 'vi',
      location: process.env.YT_REGION || 'VN',
      retrieve_player: true,
      cache: new UniversalCache(false),
    });
  }
  return _yt;
}

/* ---------------- helpers ---------------- */

/**
 * Lấy chuỗi từ node Text của youtubei.js.
 *
 * Bẫy: bản cũ có `v?.toString?.()` làm phương án cuối, nên gặp object không có
 * trường `text` là trả về đúng chữ "[object Object]" rồi in thẳng ra giao diện.
 * Giờ chỉ nhận chuỗi thật, còn lại trả rỗng.
 */
const txt = (v: any): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v.text === 'string') return v.text;

  // một số node gói chuỗi trong mảng runs
  if (Array.isArray(v.runs)) {
    return v.runs.map((r: any) => (typeof r?.text === 'string' ? r.text : '')).join('');
  }
  return '';
};

function bestThumb(thumbs: any, minW = 0): string {
  const arr: any[] = Array.isArray(thumbs) ? thumbs : thumbs?.thumbnails ?? [];
  if (!arr.length) return '';
  const sorted = [...arr].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const pick = sorted.find((t) => (t.width ?? 0) >= minW) ?? sorted[0];
  const u = pick?.url ?? '';
  return u.startsWith('//') ? 'https:' + u : u;
}

/** Bóc node kiểu RichItem / GridVideo / v.v. về node video thật */
function unwrap(n: any): any {
  return n?.content ?? n?.video ?? n?.item ?? n;
}

export function isVideoNode(n: any): boolean {
  const t = n?.type;
  return (
    !!n?.id &&
    ['Video', 'GridVideo', 'CompactVideo', 'PlaylistVideo', 'WatchCardCompactVideo',
     'ReelItem', 'ShortsLockupView', 'VideoCard', 'LockupView'].includes(t)
  );
}

/** Bóc các dòng metadata của LockupView: hàng 0 là tên kênh, hàng 1 là lượt xem / ngày đăng */
function lockupRows(n: any): { author: string; views: string; published: string } {
  const rows: any[] = n?.metadata?.metadata?.metadata_rows ?? [];
  const partsOf = (i: number): string[] =>
    (rows[i]?.metadata_parts ?? []).map((p: any) => txt(p?.text)).filter(Boolean);

  const first = partsOf(0);
  const second = partsOf(1);

  // Kênh có tick xanh đôi khi đẩy mọi thứ xuống một hàng
  const info = second.length ? second : first.length > 1 ? first.slice(1) : [];

  return {
    author: first[0] ?? '',
    views: info[0] ?? '',
    published: info[1] ?? '',
  };
}

export function mapVideo(raw: any): VideoItem | null {
  const n = unwrap(raw);

  /* ---- Shorts: cấu trúc khác hẳn, không có id lẫn title ở chỗ thường ---- */
  if (n?.type === 'ShortsLockupView') {
    const id =
      n?.on_tap_endpoint?.payload?.videoId ??
      n?.inline_player_data?.payload?.videoId ??
      n?.entity_id?.replace(/^shorts-shelf-item-/, '') ??
      '';
    const title = txt(n?.overlay_metadata?.primary_text) || n?.accessibility_text || '';
    if (!id || !title) return null;

    return {
      id,
      title,
      thumbnail: bestThumb(n?.thumbnail, 300) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      durationSec: null,
      durationText: 'Shorts',
      viewsText: txt(n?.overlay_metadata?.secondary_text),
      publishedText: '',
      isLive: false,
      author: { id: '', name: '', avatar: '', verified: false },
    };
  }

  /* ---- LockupView: kiểu card mới của YouTube, dữ liệu nằm sâu hơn ---- */
  if (n?.type === 'LockupView') {
    const id: string = n?.content_id ?? '';
    const title = txt(n?.metadata?.title);
    if (!id || !title || n?.content_type === 'CHANNEL') return null;

    const rows = lockupRows(n);
    const image =
      n?.content_image?.primary_thumbnail?.image ??
      n?.content_image?.image ??
      n?.content_image?.thumbnails;

    const overlays: any[] = n?.content_image?.primary_thumbnail?.overlays ?? [];
    const badge = overlays
      .map((o: any) => txt(o?.badges?.[0]?.text) || txt(o?.text))
      .find(Boolean);

    return {
      id,
      title,
      thumbnail: bestThumb(image, 300) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      durationSec: null,
      durationText: badge && !/xem|view/i.test(badge) ? badge : '',
      viewsText: rows.views,
      publishedText: rows.published,
      isLive: /trực tiếp|live/i.test(badge ?? ''),
      author: {
        id: '',
        name: rows.author,
        avatar: bestThumb(n?.metadata?.image?.avatar?.image ?? n?.metadata?.image?.image),
        verified: false,
      },
    };
  }

  /* ---- các kiểu node cũ ---- */
  const id: string = n?.id ?? n?.video_id ?? n?.content_id ?? '';
  if (!id || id.length > 20) return null;

  const durationSec =
    n?.duration?.seconds ?? n?.length_seconds ?? n?.accessibility_text_duration ?? null;

  const author = n?.author ?? n?.channel ?? {};

  const title = txt(n?.title) || txt(n?.headline) || txt(n?.metadata?.title) || '';
  if (!title) return null;

  return {
    id,
    title,
    thumbnail:
      bestThumb(n?.thumbnails ?? n?.thumbnail ?? n?.content_image?.image, 300) ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSec: typeof durationSec === 'number' ? durationSec : null,
    durationText: txt(n?.duration) || '',
    viewsText: txt(n?.short_view_count) || txt(n?.view_count) || '',
    publishedText: txt(n?.published) || txt(n?.publish_date) || '',
    isLive: !!(n?.is_live || n?.is_live_content),
    author: {
      id: author?.id ?? author?.channel_id ?? '',
      name: txt(author?.name) || txt(author),
      avatar: bestThumb(author?.thumbnails),
      verified: !!(author?.is_verified || author?.is_verified_artist),
    },
  };
}

export function mapChannel(raw: any): ChannelItem | null {
  const n = unwrap(raw);
  const id = n?.id ?? n?.author?.id;
  if (!id) return null;
  return {
    id,
    name: txt(n?.author?.name) || txt(n?.title) || '',
    avatar: bestThumb(n?.author?.thumbnails ?? n?.thumbnails),
    subsText: txt(n?.subscriber_count) || txt(n?.video_count) || '',
    videoCountText: txt(n?.video_count),
    verified: !!n?.author?.is_verified,
  };
}

/**
 * Lấy video từ một feed.
 *
 * Ưu tiên getter `videos` của youtubei.js: các lớp kế thừa Feed (Channel, Search,
 * HomeFeed…) không giữ dữ liệu ở `contents` mà ở một `memo` nội bộ, nên việc tự
 * duyệt cây sẽ không thấy gì — đây chính là lý do trang kênh từng trống trơn.
 *
 * Chỉ khi getter đó không có hoặc trả rỗng mới rơi xuống cách duyệt thủ công,
 * dùng cho dữ liệu thô lấy từ actions.execute().
 */
export function videosFrom(feed: any, limit = 60): VideoItem[] {
  const out: VideoItem[] = [];
  const seen = new Set<string>();

  try {
    const list = feed?.videos;
    if (Array.isArray(list)) {
      for (const raw of list) {
        if (out.length >= limit) break;
        const v = mapVideo(raw);
        if (v && !seen.has(v.id)) {
          seen.add(v.id);
          out.push(v);
        }
      }
    }
  } catch {
    /* getter có thể ném nếu feed không phải kiểu Feed */
  }

  if (out.length) return out;
  return collectVideos(feed, limit);
}

/** Duyệt sâu một feed bất kỳ và gom tất cả video hợp lệ */
export function collectVideos(root: any, limit = 60): VideoItem[] {
  const out: VideoItem[] = [];
  const seen = new Set<string>();
  const stack: any[] = [root];
  let guard = 0;

  while (stack.length && out.length < limit && guard++ < 20000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;

    if (isVideoNode(node) || isVideoNode(unwrap(node))) {
      const v = mapVideo(node);
      if (v && !seen.has(v.id)) {
        seen.add(v.id);
        out.push(v);
        continue;
      }
    }

    const kids =
      node.contents ?? node.items ?? node.videos ?? node.results ?? node.content ?? null;
    if (Array.isArray(kids)) {
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    } else if (kids && typeof kids === 'object') {
      stack.push(kids);
    }
  }
  return out;
}

export function mapComment(raw: any): CommentItem | null {
  const c = raw?.comment ?? raw;
  const id = c?.comment_id ?? raw?.comment_id;
  if (!id) return null;
  return {
    id,
    author: txt(c?.author?.name),
    authorId: c?.author?.id ?? '',
    avatar: bestThumb(c?.author?.thumbnails),
    text: txt(c?.content) || txt(c?.text),
    published: txt(c?.published_time) || txt(c?.published),
    likes: txt(c?.like_count) || txt(c?.vote_count) || '',
    replyCount: Number(c?.reply_count ?? raw?.reply_count ?? 0) || 0,
    isPinned: !!c?.is_pinned,
    isHearted: !!c?.is_hearted,
    isOwner: !!c?.author_is_channel_owner,
  };
}

export { txt, bestThumb };
