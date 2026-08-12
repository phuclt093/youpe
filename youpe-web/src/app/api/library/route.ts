import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { libraryClear, libraryList, libraryRemove, libraryUpsert } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `subs` = kênh đăng ký, `playlists` = danh sách phát tự tạo.
 *
 * Bảng `library` thực chất là "danh sách các thứ có id", không riêng gì video —
 * kênh và danh sách phát nhét vừa y như cũ, khỏi phải dựng thêm bảng.
 */
const LISTS = ['history', 'later', 'liked', 'playlists', 'subs'];
const unauthorized = () => NextResponse.json({ error: 'chưa đăng nhập' }, { status: 401 });

/** GET /api/library?list=history */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const list = req.nextUrl.searchParams.get('list') ?? 'history';
  if (!LISTS.includes(list)) return NextResponse.json({ error: 'list không hợp lệ' }, { status: 400 });

  return NextResponse.json({ items: await libraryList(user.id, list) });
}

/** POST { list, video } — thêm hoặc cập nhật */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { list } = body;
  // `video` là tên cũ, app TV vẫn đang gửi bằng tên đó — nhận cả hai
  const item = body.item ?? body.video;

  if (!LISTS.includes(list) || !item?.id)
    return NextResponse.json({ error: 'dữ liệu không hợp lệ' }, { status: 400 });

  await libraryUpsert(user.id, list, item);

  return NextResponse.json({ ok: true });
}

/** DELETE ?list=liked&videoId=xxx — bỏ videoId thì xoá cả danh sách */
export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const list = req.nextUrl.searchParams.get('list');
  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!list || !LISTS.includes(list))
    return NextResponse.json({ error: 'list không hợp lệ' }, { status: 400 });

  if (videoId) await libraryRemove(user.id, list, videoId);
  else await libraryClear(user.id, list);

  return NextResponse.json({ ok: true });
}
