import { NextRequest, NextResponse } from 'next/server';
import { getYT } from '@/lib/innertube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ suggestions: [] });
  try {
    const yt = await getYT();
    const s = await yt.getSearchSuggestions(q);
    return NextResponse.json({ suggestions: (s ?? []).slice(0, 10) });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
