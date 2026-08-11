import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);

  const res = NextResponse.json({ ok: true });
  /*
    Xoá cookie phải dùng đúng bộ thuộc tính lúc đặt. Ở chế độ server dùng chung,
    cookie mang `SameSite=None; Secure`; xoá bằng bộ khác là trình duyệt coi đó là
    một cookie khác và cookie cũ vẫn nằm nguyên — đăng xuất xong vẫn còn đăng nhập.
  */
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(new Date(0)), expires: new Date(0) });
  return res;
}
