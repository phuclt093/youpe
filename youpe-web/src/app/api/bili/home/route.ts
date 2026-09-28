import { NextRequest, NextResponse } from 'next/server';
import { homeBili } from '@/lib/bili-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Trang chủ đổi chậm; nhớ 10 phút để mở tab Bilibili không phải chờ mỗi lần
const TTL = 10 * 60 * 1000;
const cache = new Map<number, { at: number; body: any }>();

/** GET /api/bili/home?page=2 */
export async function GET(req: NextRequest) {
  const page = Math.max(1, Math.min(20, Number(req.nextUrl.searchParams.get('page')) || 1));
  const hit = cache.get(page);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  const { items, tried } = await homeBili(page);
  const body = { items, tried, page };
  if (items.length) cache.set(page, { at: Date.now(), body });
  return NextResponse.json(body);
}
