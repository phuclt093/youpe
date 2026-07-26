import { NextRequest, NextResponse } from 'next/server';
import {
  createSession, findUserByEmail, sessionCookieOptions, SESSION_COOKIE, verifyPassword,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email = '', password = '' } = await req.json();
    const row = findUserByEmail(email);

    // cùng một thông báo cho cả 2 trường hợp, tránh lộ email nào đã đăng ký
    if (!row || !verifyPassword(password, row.passwordHash))
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });

    const { token, expiresAt } = createSession(row.id);
    const res = NextResponse.json({
      user: { id: row.id, email: row.email, name: row.name },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'lỗi đăng nhập' }, { status: 500 });
  }
}
