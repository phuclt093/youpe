import type { VideoItem } from './types';
import type { UserRow, SessionRow, LibraryRow } from './db-json';
import * as jsonStore from './db-json';

export type { UserRow, SessionRow, LibraryRow };

/**
 * Lớp chọn backend lưu trữ.
 *
 *   DB_DRIVER=sqlite  ép dùng SQLite
 *   DB_DRIVER=json    ép dùng file JSON
 *   DB_DRIVER=auto    (mặc định) có `node:sqlite` thì dùng, không thì quay về JSON
 *
 * `node:sqlite` nằm sẵn trong Node 22.5+ nên không phải cài gói nào và không có
 * bước biên dịch native — chính là thứ đã làm hỏng lần thử better-sqlite3.
 * Lần đầu chạy với SQLite, dữ liệu trong `data/youpe.json` được chuyển sang tự động.
 */

type Store = {
  findUserByEmailRow(email: string): UserRow | undefined;
  findUserById(id: number): UserRow | undefined;
  insertUser(email: string, name: string, passwordHash: string): UserRow;
  insertSession(token: string, userId: number, expiresAt: number): void;
  getSession(token: string): SessionRow | undefined;
  deleteSession(token: string): void;
  pruneSessions(): void;
  libraryList(userId: number, list: string): LibraryRow[];
  libraryUpsert(userId: number, list: string, video: VideoItem): void;
  libraryRemove(userId: number, list: string, videoId: string): void;
  libraryClear(userId: number, list: string): void;
};

function sqliteAvailable(): boolean {
  try {
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
}

function pick(): { store: Store; driver: string } {
  const want = (process.env.DB_DRIVER ?? 'auto').toLowerCase();

  if (want !== 'json' && (want === 'sqlite' || sqliteAvailable())) {
    try {
      return { store: require('./db-sqlite') as Store, driver: 'sqlite' };
    } catch (e) {
      console.error('[db] không mở được SQLite, quay về JSON:', e);
    }
  }

  if (want === 'sqlite') {
    console.warn('[db] DB_DRIVER=sqlite nhưng node:sqlite không dùng được — cần Node 22.5 trở lên');
  }

  return { store: jsonStore as Store, driver: 'json' };
}

const g = globalThis as any;
const picked: { store: Store; driver: string } = g.__youpeStoreDriver ?? (g.__youpeStoreDriver = pick());

export const dbDriver = picked.driver;
const store = picked.store;

if (!g.__youpeDbLogged) {
  g.__youpeDbLogged = true;
  console.info(`[db] đang dùng ${dbDriver}`);
}

/* ---------------- API dùng chung ---------------- */

export const findUserByEmailRow: Store['findUserByEmailRow'] = (e) => store.findUserByEmailRow(e);
export const findUserById: Store['findUserById'] = (id) => store.findUserById(id);
export const insertUser: Store['insertUser'] = (e, n, h) => store.insertUser(e, n, h);

export const insertSession: Store['insertSession'] = (t, u, x) => store.insertSession(t, u, x);
export const getSession: Store['getSession'] = (t) => store.getSession(t);
export const deleteSession: Store['deleteSession'] = (t) => store.deleteSession(t);
export const pruneSessions: Store['pruneSessions'] = () => store.pruneSessions();

export const libraryList: Store['libraryList'] = (u, l) => store.libraryList(u, l);
export const libraryUpsert: Store['libraryUpsert'] = (u, l, v) => store.libraryUpsert(u, l, v);
export const libraryRemove: Store['libraryRemove'] = (u, l, v) => store.libraryRemove(u, l, v);
export const libraryClear: Store['libraryClear'] = (u, l) => store.libraryClear(u, l);
