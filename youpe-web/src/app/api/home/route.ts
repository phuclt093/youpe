import { NextRequest, NextResponse } from 'next/server';
import { getYT, videosFrom } from '@/lib/innertube';
import { buildHome } from '@/lib/recommend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/home — trang chủ trộn theo những gì người dùng theo dõi.
 *
 * Phải là POST vì tín hiệu cá nhân hoá nằm ở phía máy người dùng: kênh đăng ký và
 * lịch sử xem đều lưu trong `localStorage`, server không tự biết được. Nhét cả
 * danh sách kênh vào query string thì vừa dài vừa lọt vào log.
 *
 * Body: `{ channelIds: string[], seedTitles: string[], watchedIds: string[] }`
 *
 * Chưa theo dõi gì thì trả về đúng feed chung — trang chủ của người mới không
 * nên trống trơn, và cũng không nên bắt họ đăng ký kênh mới có gì xem.
 */
export async function GET() {
  return NextResponse.json({ error: 'dùng POST' }, { status: 405 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const channelIds: string[] = Array.isArray(body.channelIds) ? body.channelIds.slice(0, 60) : [];
    const seedTitles: string[] = Array.isArray(body.seedTitles) ? body.seedTitles.slice(0, 30) : [];
    const watchedIds: string[] = Array.isArray(body.watchedIds) ? body.watchedIds.slice(0, 200) : [];

    const yt = await getYT();

    /*
      Lấy feed chung trước, dùng cho hai việc: làm nguồn "khám phá" trong bộ trộn,
      và làm phương án dự phòng nếu chưa có tín hiệu cá nhân hoá nào.
    */
    let general: any[] = [];
    try {
      const feed = await yt.getHomeFeed();
      general = videosFrom(feed, 48);
    } catch {
      general = [];
    }

    const { videos, mix } = await buildHome(yt, general, { channelIds, seedTitles, watchedIds });

    if (!videos.length) {
      return NextResponse.json({ videos: general, mix: [], personalized: false });
    }

    return NextResponse.json({ videos, mix, personalized: true });
  } catch (e: any) {
    console.error('[api/home] hỏng:', e);
    return NextResponse.json({ error: e?.message ?? 'lỗi trang chủ', videos: [] }, { status: 500 });
  }
}
