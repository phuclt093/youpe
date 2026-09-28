import { NextRequest, NextResponse } from 'next/server';
import { biliGet, collect, homePaths, searchPaths } from '@/lib/bili-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/bili/debug?q=naruto
 *
 * Gọi từng đường dẫn ứng viên và trả nguyên văn phản hồi (cắt bớt cho gọn), kèm số
 * thẻ bộ nhặt tìm được. Dùng khi tab Bilibili trống: mở đường dẫn này, copy kết quả
 * gửi cho người sửa là biết ngay bilibili.tv đang trả cái gì.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() || 'anime';
  const paths = [...homePaths(), ...searchPaths(q)];

  const results = [];
  for (const [path, params] of paths) {
    const r = await biliGet(path, params);
    const found = r.ok ? collect(r.body?.data ?? r.body, 5) : [];
    const raw = r.body ? JSON.stringify(r.body) : '';
    results.push({
      url: r.url,
      status: r.status,
      ok: r.ok,
      error: r.error,
      code: r.body?.code,
      message: r.body?.message,
      found: found.length,
      sample: found.slice(0, 3),
      raw: raw.length > 3000 ? raw.slice(0, 3000) + '…' : raw,
    });
  }
  return NextResponse.json({ q, results });
}
