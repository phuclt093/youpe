import { NextRequest, NextResponse } from 'next/server';
import { getYT, collectVideos, mapChannel, txt, bestThumb } from '@/lib/innertube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  const filter = req.nextUrl.searchParams.get('filter') || 'all';
  if (!q) return NextResponse.json({ videos: [], channels: [] });

  try {
    const yt = await getYT();
    const opts: any = {};
    if (filter === 'video') opts.type = 'video';
    if (filter === 'channel') opts.type = 'channel';
    if (filter === 'playlist') opts.type = 'playlist';

    const res: any = await yt.search(q, opts);
    const videos = collectVideos(res, 40);

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

    return NextResponse.json({ videos, channels: channels.slice(0, 3) });
  } catch (e: any) {
    return NextResponse.json({ videos: [], channels: [], error: e?.message }, { status: 200 });
  }
}
