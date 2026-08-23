import { NextRequest, NextResponse } from 'next/server';
import { getXoilacStream } from '@/lib/xoilac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const matchId = req.nextUrl.searchParams.get('matchId') || '';
  const sourceId = req.nextUrl.searchParams.get('sourceId') || undefined;

  if (!matchId) {
    return NextResponse.json({ error: 'Missing matchId parameter' }, { status: 400 });
  }

  try {
    const streamData = await getXoilacStream(matchId, sourceId);
    return NextResponse.json({
      success: true,
      ...streamData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Error resolving Xoilac stream' },
      { status: 500 }
    );
  }
}
