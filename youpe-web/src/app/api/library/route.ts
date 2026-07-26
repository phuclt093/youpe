import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { libraryClear, libraryList, libraryRemove, libraryUpsert } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LISTS = ['history', 'later', 'liked', 'playlists'];
const unauthorized = () => NextResponse.json({ error: 'chưa đăng nhập' }, { status: 401 });

/** GET /api/library?list=history */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const list = req.nextUrl.searchParams.get('list') ?? 'history';
  if (!LISTS.includes(list)) return NextResponse.json({ error: 'list không hợp lệ' }, { status: 400 });

  return NextResponse.json({ items: libraryList(user.id, list) });
}

/** POST { list, video } — thêm hoặc cập nhật */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { list, video } = await req.json();
  if (!LISTS.includes(list) || !video?.id)
    return NextResponse.json({ error: 'dữ liệu không hợp lệ' }, { status: 400 });

  libraryUpsert(user.id, list, video);

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

  if (videoId) libraryRemove(user.id, list, videoId);
  else libraryClear(user.id, list);

  return NextResponse.json({ ok: true });
}
