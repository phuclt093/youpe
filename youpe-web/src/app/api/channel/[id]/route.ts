import { NextRequest, NextResponse } from 'next/server';
import { getYT, collectVideos, txt, bestThumb } from '@/lib/innertube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tab = req.nextUrl.searchParams.get('tab') || 'videos';
  try {
    const yt = await getYT();
    const ch: any = await yt.getChannel(id);
    const h = ch.header ?? {};

    let feed: any = ch;
    try {
      if (tab === 'videos') feed = await ch.getVideos();
      else if (tab === 'shorts') feed = await ch.getShorts();
      else if (tab === 'live') feed = await ch.getLiveStreams();
    } catch {
      feed = ch;
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
      videos: collectVideos(feed, 48),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'channel error' }, { status: 500 });
  }
}
