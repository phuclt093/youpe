import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { VideoItem } from './types';

/**
 * Kho dữ liệu bằng file JSON — phương án dự phòng khi `node:sqlite` không có
 * (Node cũ hơn 22.5). Đọc hết vào RAM rồi ghi lại cả file mỗi lần thay đổi:
 * đủ cho vài người dùng, nhưng không chịu được ghi đồng thời.
 */

export type UserRow = {
  id: number;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: number;
};

export type SessionRow = { token: string; userId: number; expiresAt: number };

export type LibraryRow = VideoItem & { savedAt: number };

type Shape = {
  nextUserId: number;
  users: UserRow[];
  sessions: Record<string, SessionRow>;
  /** userId -> list -> videoId -> bản ghi */
  library: Record<string, Record<string, Record<string, LibraryRow>>>;
};

const EMPTY: Shape = { nextUserId: 1, users: [], sessions: {}, library: {} };

// App desktop trỏ ra thư mục dữ liệu của người dùng để nâng cấp không mất
const dir = process.env.YOUPE_DATA_DIR || path.resolve(process.cwd(), 'data');
const file = path.join(dir, 'youpe.json');

function load(): Shape {
  try {
    mkdirSync(dir, { recursive: true });
    if (!existsSync(file)) return structuredClone(EMPTY);
    return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(file, 'utf-8')) };
  } catch {
    return structuredClone(EMPTY);
  }
}

const g = globalThis as any;
const state: Shape = g.__youpeStore ?? (g.__youpeStore = load());

let pending: NodeJS.Timeout | null = null;

/** Ghi ra file tạm rồi rename — mất điện giữa chừng cũng không hỏng dữ liệu cũ */
function flush() {
  pending = null;
  try {
    mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    writeFileSync(tmp, JSON.stringify(state), 'utf-8');
    renameSync(tmp, file);
  } catch (e) {
    console.error('[store] ghi file hỏng:', e);
  }
}

/** Gom nhiều thay đổi liên tiếp thành một lần ghi */
function save() {
  if (pending) return;
  pending = setTimeout(flush, 150);
}

/* ---------------- users ---------------- */

export function findUserByEmailRow(email: string): UserRow | undefined {
  const e = email.trim().toLowerCase();
  return state.users.find((u) => u.email === e);
}

export function findUserById(id: number): UserRow | undefined {
  return state.users.find((u) => u.id === id);
}

export function insertUser(email: string, name: string, passwordHash: string): UserRow {
  const row: UserRow = {
    id: state.nextUserId++,
    email: email.trim().toLowerCase(),
    name,
    passwordHash,
    createdAt: Date.now(),
  };
  state.users.push(row);
  save();
  return row;
}

/* ---------------- sessions ---------------- */

export function insertSession(token: string, userId: number, expiresAt: number) {
  state.sessions[token] = { token, userId, expiresAt };
  save();
}

export function getSession(token: string): SessionRow | undefined {
  return state.sessions[token];
}

export function deleteSession(token: string) {
  delete state.sessions[token];
  save();
}

/** Dọn phiên hết hạn, chạy một lần lúc nạp module */
export function pruneSessions() {
  const now = Date.now();
  let changed = false;
  for (const [t, s] of Object.entries(state.sessions)) {
    if (s.expiresAt < now) {
      delete state.sessions[t];
      changed = true;
    }
  }
  if (changed) save();
}
pruneSessions();

/* ---------------- library ---------------- */

const MAX_PER_LIST = 500;

function bucket(userId: number, list: string) {
  const u = (state.library[userId] ??= {});
  return (u[list] ??= {});
}

export function libraryList(userId: number, list: string): LibraryRow[] {
  return Object.values(bucket(userId, list)).sort((a, b) => b.savedAt - a.savedAt);
}

export function libraryUpsert(userId: number, list: string, video: VideoItem) {
  const b = bucket(userId, list);
  b[video.id] = { ...video, savedAt: Date.now() };

  const items = Object.values(b);
  if (items.length > MAX_PER_LIST) {
    items
      .sort((a, b2) => b2.savedAt - a.savedAt)
      .slice(MAX_PER_LIST)
      .forEach((old) => delete b[old.id]);
  }
  save();
}

export function libraryRemove(userId: number, list: string, videoId: string) {
  delete bucket(userId, list)[videoId];
  save();
}

export function libraryClear(userId: number, list: string) {
  const u = state.library[userId];
  if (u) delete u[list];
  save();
}
