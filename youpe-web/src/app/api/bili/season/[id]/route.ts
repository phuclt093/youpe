import { NextResponse } from 'next/server';
import { seasonBili, type Season } from '@/lib/bili-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL = 30 * 60 * 1000;
const cache = new Map<string, { at: number; s: Season }>();

/** GET /api/bili/season/<season_id> — danh sách tập của một phần phim */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'season_id không hợp lệ' }, { status: 400 });

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.s);

  const s = await seasonBili(id);
  if (s.episodes.length) cache.set(id, { at: Date.now(), s });
  return NextResponse.json(s);
}
