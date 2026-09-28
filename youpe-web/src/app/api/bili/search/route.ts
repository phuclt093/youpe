import { NextRequest, NextResponse } from 'next/server';
import { searchBili } from '@/lib/bili-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/bili/search?q=...&page=2 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ items: [] });
  const page = Math.max(1, Math.min(20, Number(req.nextUrl.searchParams.get('page')) || 1));
  const { items, tried } = await searchBili(q, page);
  return NextResponse.json({ items, tried, page });
}
