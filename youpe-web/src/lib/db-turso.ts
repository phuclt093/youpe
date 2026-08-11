import { createClient, type Client } from '@libsql/client/web';
import type { VideoItem } from './types';
import type { UserRow, SessionRow, LibraryRow } from './db-json';

/**
 * Kho dữ liệu đặt trên Turso (libSQL) — dùng chung cho mọi thiết bị.
 *
 * Cấu hình:
 *   TURSO_DATABASE_URL=libsql://<tên>-<tài khoản>.turso.io
 *   TURSO_AUTH_TOKEN=<token>
 *
 * Lược đồ giống hệt bản SQLite trên máy, vì libSQL chính là SQLite — chuyển qua
 * lại không phải viết lại một câu lệnh nào.
 *
 * ---
 *
 * Nhập từ `@libsql/client/web` chứ **không** phải `@libsql/client`.
 *
 * Cửa vào mặc định của gói kéo theo `libsql`, một gói có phần nhị phân biên dịch
 * sẵn cho từng nền tảng. Gói kiểu đó chính là thứ đã làm hỏng lần thử
 * better-sqlite3 trước đây, và nó cũng làm bản đóng gói desktop phình ra vì phải
 * mang theo nhị phân của mọi hệ điều hành. Bản `/web` thuần JavaScript, nói
 * chuyện với Turso qua HTTP, nên đóng gói ở đâu cũng chạy.
 *
 * Đổi lại, bản này **không làm được bản sao nhúng** (file SQLite trên máy tự
 * đồng bộ lên cloud). Hiện chưa cần: cả nhà cùng dùng một cơ sở dữ liệu. Ngày
 * nào muốn đọc nhanh khi ngoại tuyến thì mới tính tới việc đổi cửa vào.
 */

const url = process.env.TURSO_DATABASE_URL ?? '';
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) throw new Error('thiếu TURSO_DATABASE_URL');

const g = globalThis as any;

function open(): Client {
  const client = createClient({ url, authToken });

  /*
    Dựng bảng ngay lúc nạp module, nhưng **không chờ**.

    Chờ thì mọi hàm bên dưới phải chờ theo, mà chúng chỉ chạy khi có request thật —
    lúc đó lệnh tạo bảng đã xong từ lâu. Đổi lại phải giữ lời hứa này để câu truy
    vấn đầu tiên có cái mà chờ, phòng khi request tới sớm hơn.
  */
  g.__youpeTursoReady = client
    .batch(
      [
        `CREATE TABLE IF NOT EXISTS users (
           id            INTEGER PRIMARY KEY AUTOINCREMENT,
           email         TEXT NOT NULL UNIQUE,
           name          TEXT NOT NULL,
           password_hash TEXT NOT NULL,
           created_at    INTEGER NOT NULL
         )`,
        `CREATE TABLE IF NOT EXISTS sessions (
           token      TEXT PRIMARY KEY,
           user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           expires_at INTEGER NOT NULL
         )`,
        `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
        `CREATE TABLE IF NOT EXISTS library (
           user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           list     TEXT NOT NULL,
           video_id TEXT NOT NULL,
           payload  TEXT NOT NULL,
           saved_at INTEGER NOT NULL,
           PRIMARY KEY (user_id, list, video_id)
         )`,
        `CREATE INDEX IF NOT EXISTS idx_library ON library(user_id, list, saved_at DESC)`,
      ],
      'write'
    )
    .then(() => {
      console.info('[db] Turso sẵn sàng');
    })
    .catch((e: unknown) => {
      console.error('[db] không dựng được bảng trên Turso:', e);
      throw e;
    });

  return client;
}

const db: Client = g.__youpeTurso ?? (g.__youpeTurso = open());
const ready = (): Promise<unknown> => g.__youpeTursoReady ?? Promise.resolve();

/**
 * Chờ bảng dựng xong rồi mới chạy — sau lần đầu thì Promise đã xong, gần như
 * không tốn gì.
 *
 * Lỗi được gói lại kèm câu SQL. Thư viện libsql ném ra những câu như "Cannot
 * convert undefined or null to object" mà không nói nó vấp ở đâu; không kèm SQL
 * thì phải ngồi đoán trong mười mấy chỗ gọi.
 */
async function q(sql: string, args: any[] = []) {
  await ready();
  try {
    return await db.execute({ sql, args });
  } catch (e: any) {
    throw new Error(`[turso] ${e?.message ?? e} — khi chạy: ${gon(sql)}`, { cause: e });
  }
}

const gon = (sql: string) => sql.replace(/\s+/g, ' ').trim().slice(0, 80);

/** Nhiều câu lệnh trong một vòng gọi mạng, cũng gói lỗi kèm SQL như `q()` */
async function batched(stmts: { sql: string; args: any[] }[]) {
  await ready();
  try {
    return await db.batch(stmts, 'write');
  } catch (e: any) {
    throw new Error(
      `[turso] ${e?.message ?? e} — khi chạy lô: ${stmts.map((s) => gon(s.sql)).join(' | ')}`,
      { cause: e }
    );
  }
}

/* ---------------- users ---------------- */

const toUser = (r: any): UserRow | undefined =>
  r && {
    id: Number(r.id),
    email: String(r.email),
    name: String(r.name),
    passwordHash: String(r.password_hash),
    createdAt: Number(r.created_at),
  };

export async function findUserByEmailRow(email: string): Promise<UserRow | undefined> {
  const r = await q('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  return toUser(r.rows[0]);
}

export async function findUserById(id: number): Promise<UserRow | undefined> {
  const r = await q('SELECT * FROM users WHERE id = ?', [id]);
  return toUser(r.rows[0]);
}

export async function insertUser(
  email: string,
  name: string,
  passwordHash: string
): Promise<UserRow> {
  const now = Date.now();
  const clean = email.trim().toLowerCase();

  // RETURNING thay cho lastInsertRowid: một vòng gọi mạng thay vì hai
  const r = await q(
    'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?) RETURNING id',
    [clean, name, passwordHash, now]
  );

  return { id: Number(r.rows[0].id), email: clean, name, passwordHash, createdAt: now };
}

/* ---------------- sessions ---------------- */

export async function insertSession(token: string, userId: number, expiresAt: number) {
  await q('INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [
    token,
    userId,
    expiresAt,
  ]);
}

export async function getSession(token: string): Promise<SessionRow | undefined> {
  const r = await q('SELECT * FROM sessions WHERE token = ?', [token]);
  const row = r.rows[0];
  return row && {
    token: String(row.token),
    userId: Number(row.user_id),
    expiresAt: Number(row.expires_at),
  };
}

export async function deleteSession(token: string) {
  await q('DELETE FROM sessions WHERE token = ?', [token]);
}

/**
 * Phiên kèm người dùng trong một câu.
 *
 * Đây là chỗ đáng giá nhất của cả file: đường này chạy ở mọi request có đăng
 * nhập, và gộp lại cắt đúng một vòng gọi xuyên biển.
 */
export async function findUserBySession(
  token: string
): Promise<{ user: UserRow; expiresAt: number } | undefined> {
  const r = await q(
    `SELECT u.*, s.expires_at AS session_expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token]
  );

  const row = r.rows[0] as any;
  const user = toUser(row);
  return user && { user, expiresAt: Number(row.session_expires_at) };
}

/**
 * Dọn phiên hết hạn.
 *
 * Bản trên máy gọi hàm này ngay lúc nạp module. Ở đây thì không: mỗi tiến trình
 * khởi động lại là một lượt ghi lên cloud, mà Turso tính tiền theo số dòng ghi.
 * Để nơi gọi tự quyết định khi nào dọn.
 */
export async function pruneSessions() {
  await q('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
}

/* ---------------- library ---------------- */

const MAX_PER_LIST = 500;

export async function libraryList(userId: number, list: string): Promise<LibraryRow[]> {
  const r = await q(
    'SELECT payload, saved_at FROM library WHERE user_id = ? AND list = ? ORDER BY saved_at DESC LIMIT ?',
    [userId, list, MAX_PER_LIST]
  );
  return r.rows.map((row: any) => ({
    ...JSON.parse(String(row.payload)),
    savedAt: Number(row.saved_at),
  }));
}

export async function libraryUpsert(userId: number, list: string, video: VideoItem) {
  /*
    Ghi và cắt bớt gộp trong một `batch`: hai câu lệnh đi chung một vòng gọi mạng
    thay vì hai. Với cơ sở dữ liệu trên máy thì chẳng khác gì, nhưng qua mạng thì
    mỗi vòng là vài chục mili giây, và `libraryUpsert` là hàm bị gọi nhiều nhất.
  */
  await batched([
    {
      sql: `INSERT INTO library (user_id, list, video_id, payload, saved_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, list, video_id)
            DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at`,
      args: [userId, list, video.id, JSON.stringify(video), Date.now()],
    },
    {
      sql: `DELETE FROM library
            WHERE user_id = ? AND list = ? AND video_id NOT IN (
              SELECT video_id FROM library
              WHERE user_id = ? AND list = ?
              ORDER BY saved_at DESC LIMIT ?
            )`,
      args: [userId, list, userId, list, MAX_PER_LIST],
    },
  ]);
}

export async function libraryRemove(userId: number, list: string, videoId: string) {
  await q('DELETE FROM library WHERE user_id = ? AND list = ? AND video_id = ?', [
    userId,
    list,
    videoId,
  ]);
}

export async function libraryClear(userId: number, list: string) {
  await q('DELETE FROM library WHERE user_id = ? AND list = ?', [userId, list]);
}
