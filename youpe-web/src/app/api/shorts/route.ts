import { NextRequest, NextResponse } from 'next/server';
import { getYT, videosFrom } from '@/lib/innertube';
import type { VideoItem } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Nguồn video ngắn.
 *
 * YouTube **không có một endpoint sạch nào chỉ trả Shorts** cho khách vãng lai:
 * `FEshorts` đòi phiên đăng nhập, còn feed thường thì trộn lẫn Shorts vào video dài.
 * Nên cách chắc ăn là gom từ nhiều feed rồi tự lọc ra thứ đúng là Shorts.
 *
 * `mapVideo()` đã gắn `durationText = 'Shorts'` cho node `ShortsLockupView`, đó là
 * dấu hiệu tin cậy nhất. Video dài dưới 60 giây cũng được nhận, vì YouTube xếp chúng
 * vào Shorts dù trả về dưới dạng card thường.
 */

const SHORT_MAX_SEC = 61;

function isShort(v: VideoItem): boolean {
  if (v.isLive) return false;
  if (v.durationText === 'Shorts') return true;
  return v.durationSec !== null && v.durationSec > 0 && v.durationSec <= SHORT_MAX_SEC;
}

/** Truy vấn tìm kiếm dự phòng — xáo trộn để mỗi lần vào không ra y hệt nhau */
const QUERIES = [
  '#shorts hài hước',
  '#shorts nấu ăn',
  '#shorts thú cưng',
  '#shorts âm nhạc',
  '#shorts mẹo vặt',
  '#shorts thể thao',
  '#shorts du lịch việt nam',
  '#shorts đời sống',
];

function pickQueries(n: number): string[] {
  const pool = [...QUERIES];
  const out: string[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

async function browse(yt: any, browseId: string, params?: string) {
  const payload: any = { browseId, parse: true };
  if (params) payload.params = params;
  return yt.actions.execute('/browse', payload);
}

export async function GET(req: NextRequest) {
  const seen = new Set(
    (req.nextUrl.searchParams.get('seen') || '').split(',').filter(Boolean)
  );

  try {
    const yt: any = await getYT();

    const attempts: { name: string; run: () => Promise<any> }[] = [
      { name: 'browse:FEshorts', run: () => browse(yt, 'FEshorts') },
      { name: 'getHomeFeed', run: () => yt.getHomeFeed() },
      ...pickQueries(3).map((q) => ({
        name: `search:${q}`,
        run: () => yt.search(q, { type: 'video', duration: 'short' }),
      })),
    ];

    const out: VideoItem[] = [];
    const tried: string[] = [];

    for (const a of attempts) {
      // đủ dùng thì dừng, đừng gọi thêm cho tốn
      if (out.length >= 24) break;

      try {
        const feed = await a.run();
        const found = videosFrom(feed, 60).filter(isShort);

        for (const v of found) {
          if (seen.has(v.id) || out.some((x) => x.id === v.id)) continue;
          out.push(v);
        }
        tried.push(`${a.name}: ${found.length}`);
      } catch (e: any) {
        tried.push(`${a.name}: ${e?.message ?? e}`);
      }
    }

    return NextResponse.json({
      videos: out,
      tried,
      error: out.length ? undefined : tried.join(' | '),
    });
  } catch (e: any) {
    return NextResponse.json(
      { videos: [], error: e?.message ?? 'không lấy được shorts' },
      { status: 200 }
    );
  }
}
