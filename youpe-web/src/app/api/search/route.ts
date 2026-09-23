import { NextRequest, NextResponse } from 'next/server';
import { getYT, videosFrom, mapChannel, txt, bestThumb, collectPlaylists } from '@/lib/innertube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
  Bộ lọc giống hộp "Bộ lọc tìm kiếm" của YouTube. Giá trị nào không hợp lệ thì bỏ
  qua, để URL gõ tay hay link cũ vẫn tìm được bình thường.
*/
const TYPES = ['video', 'shorts', 'channel', 'playlist', 'movie'];
const DURATIONS = ['under_three_mins', 'three_to_twenty_mins', 'over_twenty_mins'];
const DATES = ['today', 'week', 'month', 'year'];
const FEATURES = ['live', '4k', 'hd', 'subtitles', 'creative_commons', '360', 'vr180', '3d', 'hdr', 'location', 'purchased'];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  if (!q) return NextResponse.json({ videos: [], channels: [], playlists: [] });

  // `filter` là tham số cũ (Tất cả/Video/Kênh/Danh sách phát) — vẫn nhận
  const type = sp.get('type') || sp.get('filter') || '';
  const duration = sp.get('duration') || '';
  const date = sp.get('date') || '';
  const sort = sp.get('sort') || '';
  const features = (sp.get('features') || '').split(',').filter((f) => FEATURES.includes(f));

  try {
    const yt = await getYT();
    const opts: any = {};
    if (TYPES.includes(type)) opts.type = type;
    if (DURATIONS.includes(duration)) opts.duration = duration;
    if (DATES.includes(date)) opts.upload_date = date;
    if (sort === 'popularity') opts.prioritize = 'popularity';
    if (features.length) opts.features = features;

    const res: any = await yt.search(q, opts);

    const onlyChannels = opts.type === 'channel';
    const onlyPlaylists = opts.type === 'playlist';

    const videos = onlyChannels || onlyPlaylists ? [] : videosFrom(res, 40);
    const playlists = onlyChannels ? [] : collectPlaylists(res, onlyPlaylists ? 40 : 6);

    const channels: any[] = [];
    const walk = (n: any, d = 0) => {
      if (!n || typeof n !== 'object' || d > 6) return;
      if (n.type === 'Channel') {
        const c = mapChannel({
          id: n.id,
          author: { name: txt(n.author?.name) || txt(n.title), thumbnails: n.author?.thumbnails, is_verified: n.author?.is_verified },
          subscriber_count: n.subscriber_count,
          video_count: n.video_count,
          thumbnails: n.author?.thumbnails,
        });
        if (c) {
          c.name = txt(n.author?.name) || txt(n.title);
          c.avatar = bestThumb(n.author?.thumbnails);
          channels.push(c);
        }
        return;
      }
      const kids = n.contents ?? n.results ?? n.items ?? n.content;
      if (Array.isArray(kids)) kids.forEach((k) => walk(k, d + 1));
      else if (kids) walk(kids, d + 1);
    };
    walk(res);

    return NextResponse.json({
      videos,
      channels: channels.slice(0, onlyChannels ? 30 : 3),
      playlists,
    });
  } catch (e: any) {
    return NextResponse.json({ videos: [], channels: [], playlists: [], error: e?.message }, { status: 200 });
  }
}
