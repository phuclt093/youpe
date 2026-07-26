import { NextRequest, NextResponse } from 'next/server';
import { getYT } from '@/lib/innertube';
import { buildRelated } from '@/lib/recommend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/related/<id>
 * body: { seedTitles?: string[] }  — tiêu đề vài video vừa xem, để pha thêm
 *                                    phần gợi ý dựa trên hành vi
 *
 * Tách riêng khỏi /api/video để trang xem hiện ngay, còn cột gợi ý nạp sau.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let seedTitles: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.seedTitles)) seedTitles = body.seedTitles.slice(0, 12);
  } catch {
    /* không có body cũng không sao */
  }

  try {
    const yt: any = await getYT();

    let info: any = null;
    try {
      info = await yt.getInfo(id);
    } catch {
      /* không lấy được watch_next thì vẫn còn các nguồn khác */
    }

    const { videos, mix } = await buildRelated(yt, info, id, { seedTitles });
    return NextResponse.json({ videos, mix });
  } catch (e: any) {
    console.error(`[related ${id}]`, e?.message ?? e);
    return NextResponse.json({ videos: [], mix: [], error: e?.message }, { status: 200 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return POST(req, ctx);
}
