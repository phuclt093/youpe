import { NextRequest, NextResponse } from 'next/server';
import {
  createSession, createUser, findUserByEmail, sessionCookieOptions,
  SESSION_COOKIE, validateCredentials,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email = '', name = '', password = '' } = await req.json();

    const errors = validateCredentials(email, password);
    if (!name.trim()) errors.push('Cần nhập tên hiển thị');
    if (errors.length) return NextResponse.json({ error: errors[0] }, { status: 400 });

    if (await findUserByEmail(email))
      return NextResponse.json({ error: 'Email này đã được dùng' }, { status: 409 });

    const user = await createUser(email, name.trim(), password);
    const { token, expiresAt } = await createSession(user.id);

    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  } catch (e: any) {
    /*
      In cả stack ra terminal.

      Trước đây chỗ này chỉ trả `e.message` về cho trình duyệt rồi nuốt phần còn
      lại. Gặp lỗi kiểu "Cannot convert undefined or null to object" thì câu đó
      chẳng nói được nó xảy ra ở tầng nào — driver, thư viện, hay chính route này.
    */
    console.error('[auth/register] hỏng:', e);
    return NextResponse.json({ error: e?.message ?? 'lỗi đăng ký' }, { status: 500 });
  }
}
