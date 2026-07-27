import { NextRequest, NextResponse } from 'next/server';
import { getYT, videosFrom, txt, bestThumb } from '@/lib/innertube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


/** Gom playlist từ feed của kênh — mỗi bản youtubei.js đặt ở một chỗ khác nhau */
function collectPlaylists(feed: any): any[] {
  const out: any[] = [];
  const seen = new Set<string>();

  const push = (n: any) => {
    const id = n?.id ?? n?.content_id ?? n?.playlist_id;
    if (!id || seen.has(id)) return;

    const title = txt(n?.title) || txt(n?.metadata?.title);
    if (!title) return;

    seen.add(id);
    out.push({
      id,
      title,
      thumbnail:
        bestThumb(
          n?.thumbnails ?? n?.thumbnail ?? n?.content_image?.primary_thumbnail?.image,
          300
        ) || '',
      videoCount:
        txt(n?.video_count) ||
        txt(n?.video_count_short) ||
        txt(n?.thumbnail_overlays?.[0]?.text) ||
        '',
    });
  };

  try {
    for (const n of feed?.playlists ?? []) push(n);
  } catch {
    /* getter có thể không tồn tại */
  }

  // dự phòng: duyệt cây tìm node kiểu playlist
  const stack: any[] = [feed];
  let guard = 0;
  while (stack.length && out.length < 48 && guard++ < 8000) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;

    if (['Playlist', 'GridPlaylist', 'LockupView'].includes(n.type)) {
      if (n.type !== 'LockupView' || n.content_type === 'PLAYLIST') push(n);
    }

    const kids = n.contents ?? n.items ?? n.results ?? n.content;
    if (Array.isArray(kids)) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    else if (kids) stack.push(kids);
  }

  return out;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tab = req.nextUrl.searchParams.get('tab') || 'videos';
  const sort = req.nextUrl.searchParams.get('sort') || 'newest';
  try {
    const yt = await getYT();
    const ch: any = await yt.getChannel(id);
    const h = ch.header ?? {};

    /**
     * Bộ sắp xếp của YouTube là các "chip" có nhãn tiếng Anh cố định.
     * `ch.filters` cho biết kênh này có những chip nào; chỉ áp dụng khi thật sự có,
     * vì kênh ít video thường không hiện chip nào cả.
     */
    const SORT_LABEL: Record<string, string> = {
      newest: 'Latest',
      popular: 'Popular',
      oldest: 'Oldest',
    };

    let feed: any = ch;
    let tabError = '';
    let playlists: any[] = [];

    try {
      if (tab === 'videos') feed = await ch.getVideos();
      else if (tab === 'shorts') feed = await ch.getShorts();
      else if (tab === 'live') feed = await ch.getLiveStreams();
      else if (tab === 'playlists') feed = await ch.getPlaylists();
    } catch (e: any) {
      // kênh không có tab đó thì youtubei.js ném lỗi — quay về trang chính của kênh
      tabError = e?.message ?? String(e);
      feed = ch;
    }

    // sắp xếp: chỉ tab video mới có
    const wanted = SORT_LABEL[sort];
    if (tab === 'videos' && wanted && sort !== 'newest') {
      try {
        const available: string[] = feed?.filters ?? [];
        if (available.some((f) => f.toLowerCase() === wanted.toLowerCase())) {
          feed = await feed.applyFilter(wanted);
        }
      } catch (e: any) {
        tabError = tabError || `không sắp xếp được: ${e?.message ?? e}`;
      }
    }

    if (tab === 'playlists') {
      playlists = collectPlaylists(feed);
    }

    return NextResponse.json({
      id,
      name: txt(h.author?.name) || txt(h.title) || txt(ch.metadata?.title),
      avatar:
        bestThumb(h.author?.thumbnails ?? h.avatar?.image ?? ch.metadata?.avatar) || '',
      banner: bestThumb(h.banner?.image ?? h.banner?.desktop ?? h.banner),
      subsText: txt(h.subscriber_count) || txt(h.content?.metadata?.metadata_rows?.[1]?.metadata_parts?.[0]?.text) || '',
      description: txt(ch.metadata?.description) || '',
      handle: txt(h.channel_handle) || '',
      verified: !!h.author?.is_verified,
      videos: tab === 'playlists' ? [] : videosFrom(feed, 48),
      playlists,
      sorts: tab === 'videos' ? (feed?.filters ?? []) : [],
      tabError: tabError || undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'channel error' }, { status: 500 });
  }
}
