import { NextResponse } from 'next/server';
import { getYT, videosFrom, txt, bestThumb } from '@/lib/innertube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Nội dung một danh sách phát của YouTube.
 *
 * Khác với danh sách phát tự tạo (nằm ở `/api/playlists`, lưu trong máy người dùng),
 * đây là danh sách của kênh khác nên chỉ đọc.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const yt: any = await getYT();
    const p = await yt.getPlaylist(id);

    const info = p?.info ?? {};

    // Tên kênh chủ danh sách nằm ở vài chỗ khác nhau tuỳ kiểu danh sách:
    // playlist do người dùng tạo có `author`, còn "Mix" do YouTube sinh thì không.
    const author = info.author ?? p?.channels?.[0] ?? {};

    return NextResponse.json({
      id,
      title: txt(info.title) || 'Danh sách phát',
      description: txt(info.description) || '',
      thumbnail: bestThumb(info.thumbnails, 480) || '',
      totalItems: txt(info.total_items) || '',
      views: txt(info.views) || '',
      lastUpdated: txt(info.last_updated) || '',
      author: {
        id: author?.id ?? '',
        name: txt(author?.name) || '',
        avatar: bestThumb(author?.thumbnails) || '',
      },
      videos: videosFrom(p, 200),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'không lấy được danh sách phát' },
      { status: 500 }
    );
  }
}
