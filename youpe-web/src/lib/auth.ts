import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import {
  deleteSession, findUserByEmailRow, findUserById, getSession, insertSession, insertUser,
} from './db';

export const SESSION_COOKIE = 'youpe_session';
const SESSION_DAYS = 30;

export type User = { id: number; email: string; name: string };

/* ---------- mật khẩu ---------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- phiên đăng nhập ---------- */

export function createSession(userId: number): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const expires = now + SESSION_DAYS * 86_400_000;

  insertSession(token, userId, expires);

  return { token, expiresAt: new Date(expires) };
}

export function destroySession(token: string) {
  deleteSession(token);
}

export function userFromToken(token?: string | null): User | null {
  if (!token) return null;

  const session = getSession(token);
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    destroySession(token);
    return null;
  }

  const user = findUserById(session.userId);
  if (!user) return null;

  return { id: user.id, email: user.email, name: user.name };
}

/** Người dùng của request hiện tại (đọc cookie) */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}

/* ---------- người dùng ---------- */

export function findUserByEmail(email: string) {
  return findUserByEmailRow(email);
}

export function createUser(email: string, name: string, password: string): User {
  const row = insertUser(email, name, hashPassword(password));
  return { id: row.id, email: row.email, name: row.name };
}

export function validateCredentials(email: string, password: string) {
  const errors: string[] = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Email không hợp lệ');
  if (password.length < 8) errors.push('Mật khẩu phải từ 8 ký tự');
  return errors;
}
