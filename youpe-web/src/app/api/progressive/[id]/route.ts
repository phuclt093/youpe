import { NextRequest, NextResponse } from 'next/server';
import { getYT } from '@/lib/innertube';
import { getFromFallback } from '@/lib/piped';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tầng cuối cùng: luồng "muxed" (video + audio gộp sẵn, thường 360p/720p).
 * Chất lượng thấp hơn DASH nhưng phát được bằng thẻ <video> thuần,
 * dùng khi cả InnerTube lẫn DASH-từ-Piped đều hỏng.
 *
 * GET /api/progressive/<id>  ->  302 tới /api/stream?u=...
 * GET /api/progressive/<id>?json=1  ->  { url, height, source }
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = req.nextUrl.origin;
  const wantJson = req.nextUrl.searchParams.get('json') === '1';
  const errors: string[] = [];

  const pick = (url: string, height: number | undefined, source: string) => {
    const proxied = `${origin}/api/stream?u=${encodeURIComponent(url)}`;
    return wantJson
      ? NextResponse.json({ url: proxied, height: height ?? null, source })
      : NextResponse.redirect(proxied, 302);
  };

  // 1) InnerTube: streaming_data.formats là danh sách muxed
  try {
    const yt: any = await getYT();
    for (const client of ['TV_EMBEDDED', 'IOS', 'ANDROID', 'WEB']) {
      try {
        const info: any = await yt.getInfo(id, client as any);
        const best = (info?.streaming_data?.formats ?? [])
          .filter((f: any) => f?.url)
          .sort((a: any, b: any) => (b.height ?? 0) - (a.height ?? 0))[0];
        if (best?.url) return pick(best.url, best.height, `innertube:${client}`);
      } catch (e: any) {
        errors.push(`${client}: ${e?.message ?? e}`);
      }
    }
    errors.push('innertube: không có format muxed nào kèm URL');
  } catch (e: any) {
    errors.push(`innertube: ${e?.message ?? e}`);
  }

  // 2) Piped / Invidious
  try {
    const { result } = await getFromFallback(id);
    const best = result.formats
      .filter((f) => f.kind === 'muxed' && f.url)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
    if (best) return pick(best.url, best.height, result.source);
    errors.push(`${result.source}: không có luồng muxed`);
  } catch (e: any) {
    errors.push(`fallback: ${e?.message ?? e}`);
  }

  const msg = `không tìm được luồng progressive: ${errors.join(' || ')}`;
  return wantJson
    ? NextResponse.json({ error: msg }, { status: 404 })
    : new NextResponse(msg, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
