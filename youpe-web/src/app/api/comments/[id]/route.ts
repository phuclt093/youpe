import { NextRequest, NextResponse } from 'next/server';
import { getYT, mapComment } from '@/lib/innertube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sort = req.nextUrl.searchParams.get('sort') === 'newest' ? 'NEWEST_FIRST' : 'TOP_COMMENTS';
  try {
    const yt = await getYT();
    const res: any = await yt.getComments(id, sort as any);
    const items = (res?.contents ?? [])
      .map((c: any) => mapComment(c))
      .filter(Boolean);
    return NextResponse.json({
      total: res?.header?.count?.text ?? '',
      comments: items,
    });
  } catch (e: any) {
    return NextResponse.json({ comments: [], total: '', error: e?.message }, { status: 200 });
  }
}
