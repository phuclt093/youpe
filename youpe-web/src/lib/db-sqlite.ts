import { mkdirSync, existsSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { VideoItem } from './types';
import type { UserRow, SessionRow, LibraryRow } from './db-json';

/**
 * Kho dữ liệu bằng SQLite, dùng module `node:sqlite` có sẵn trong Node 22.5+.
 *
 * Chọn cách này thay vì better-sqlite3 vì không phải biên dịch native — thứ đã
 * làm hỏng lần cài trước và sẽ còn hỏng lại mỗi khi đổi phiên bản Node hoặc
 * build image Docker.
 */

const dir = path.resolve(process.cwd(), 'data');
const file = path.join(dir, 'youpe.sqlite');
const legacyJson = path.join(dir, 'youpe.json');

type Stmt = { run: (...a: any[]) => any; get: (...a: any[]) => any; all: (...a: any[]) => any[] };
type Db = { exec: (sql: string) => void; prepare: (sql: string) => Stmt; close: () => void };

function open(): Db {
  mkdirSync(dir, { recursive: true });

  // require động: bundler của Next không tĩnh hoá được node:sqlite
  const { DatabaseSync } = require('node:sqlite');
  const db: Db = new DatabaseSync(file);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS library (
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      list     TEXT NOT NULL,
      video_id TEXT NOT NULL,
      payload  TEXT NOT NULL,
      saved_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, list, video_id)
    );
    CREATE INDEX IF NOT EXISTS idx_library ON library(user_id, list, saved_at DESC);
  `);

  return db;
}

const g = globalThis as any;
const db: Db = g.__youpeSqlite ?? (g.__youpeSqlite = open());

/* ---------------- chuyển dữ liệu từ bản JSON cũ ---------------- */

function migrateFromJson() {
  if (!existsSync(legacyJson)) return;

  const already = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if ((already?.n ?? 0) > 0) return;

  try {
    const old = JSON.parse(readFileSync(legacyJson, 'utf-8'));

    const insUser = db.prepare(
      'INSERT OR IGNORE INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const u of old.users ?? []) {
      insUser.run(u.id, u.email, u.name, u.passwordHash, u.createdAt);
    }

    const insSession = db.prepare(
      'INSERT OR IGNORE INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
    );
    for (const s of Object.values<any>(old.sessions ?? {})) {
      insSession.run(s.token, s.userId, s.expiresAt);
    }

    const insLib = db.prepare(
      'INSERT OR IGNORE INTO library (user_id, list, video_id, payload, saved_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const [userId, lists] of Object.entries<any>(old.library ?? {})) {
      for (const [list, items] of Object.entries<any>(lists ?? {})) {
        for (const v of Object.values<any>(items ?? {})) {
          insLib.run(Number(userId), list, v.id, JSON.stringify(v), v.savedAt ?? Date.now());
        }
      }
    }

    // đổi tên chứ không xoá, phòng khi cần lấy lại
    renameSync(legacyJson, legacyJson + '.migrated');
    console.info('[db] đã chuyển dữ liệu từ youpe.json sang youpe.sqlite');
  } catch (e) {
    console.error('[db] chuyển dữ liệu từ JSON hỏng:', e);
  }
}
migrateFromJson();

/* ---------------- users ---------------- */

const toUser = (r: any): UserRow | undefined =>
  r && {
    id: r.id,
    email: r.email,
    name: r.name,
    passwordHash: r.password_hash,
    createdAt: r.created_at,
  };

export function findUserByEmailRow(email: string): UserRow | undefined {
  return toUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()));
}

export function findUserById(id: number): UserRow | undefined {
  return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export function insertUser(email: string, name: string, passwordHash: string): UserRow {
  const now = Date.now();
  const clean = email.trim().toLowerCase();
  const info = db
    .prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(clean, name, passwordHash, now);

  return { id: Number(info.lastInsertRowid), email: clean, name, passwordHash, createdAt: now };
}

/* ---------------- sessions ---------------- */

export function insertSession(token: string, userId: number, expiresAt: number) {
  db.prepare('INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );
}

export function getSession(token: string): SessionRow | undefined {
  const r = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  return r && { token: r.token, userId: r.user_id, expiresAt: r.expires_at };
}

export function deleteSession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function pruneSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
pruneSessions();

/* ---------------- library ---------------- */

const MAX_PER_LIST = 500;

export function libraryList(userId: number, list: string): LibraryRow[] {
  return db
    .prepare(
      'SELECT payload, saved_at FROM library WHERE user_id = ? AND list = ? ORDER BY saved_at DESC LIMIT ?'
    )
    .all(userId, list, MAX_PER_LIST)
    .map((r: any) => ({ ...JSON.parse(r.payload), savedAt: r.saved_at }));
}

export function libraryUpsert(userId: number, list: string, video: VideoItem) {
  const now = Date.now();

  db.prepare(
    `INSERT INTO library (user_id, list, video_id, payload, saved_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, list, video_id)
     DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at`
  ).run(userId, list, video.id, JSON.stringify(video), now);

  // cắt bớt phần cũ nhất, giữ danh sách gọn
  db.prepare(
    `DELETE FROM library
      WHERE user_id = ? AND list = ? AND video_id NOT IN (
        SELECT video_id FROM library
         WHERE user_id = ? AND list = ?
         ORDER BY saved_at DESC LIMIT ?
      )`
  ).run(userId, list, userId, list, MAX_PER_LIST);
}

export function libraryRemove(userId: number, list: string, videoId: string) {
  db.prepare('DELETE FROM library WHERE user_id = ? AND list = ? AND video_id = ?').run(
    userId,
    list,
    videoId
  );
}

export function libraryClear(userId: number, list: string) {
  db.prepare('DELETE FROM library WHERE user_id = ? AND list = ?').run(userId, list);
}
