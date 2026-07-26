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

const txt = (v: any): string =>
  (typeof v === 'string' ? v : v?.text ?? v?.toString?.() ?? '') || '';

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

export function mapVideo(raw: any): VideoItem | null {
  const n = unwrap(raw);
  const id: string = n?.id ?? n?.video_id ?? n?.content_id ?? '';
  if (!id || id.length > 20) return null;

  const durationSec =
    n?.duration?.seconds ?? n?.length_seconds ?? n?.accessibility_text_duration ?? null;

  const author = n?.author ?? n?.channel ?? {};

  const title =
    txt(n?.title) || txt(n?.headline) || txt(n?.metadata?.title) || '';
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
