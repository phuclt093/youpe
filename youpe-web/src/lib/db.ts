import type { VideoItem } from './types';
import type { UserRow, SessionRow, LibraryRow } from './db-json';
import * as jsonStore from './db-json';

export type { UserRow, SessionRow, LibraryRow };

/**
 * Lớp chọn backend lưu trữ.
 *
 *   DB_DRIVER=turso    dùng Turso/libSQL trên cloud (cần TURSO_DATABASE_URL)
 *   DB_DRIVER=sqlite   ép dùng SQLite trên máy
 *   DB_DRIVER=json     ép dùng file JSON
 *   DB_DRIVER=auto     (mặc định) có TURSO_DATABASE_URL thì dùng Turso, không thì
 *                      SQLite nếu `node:sqlite` chạy được, cuối cùng mới tới JSON
 *
 * `node:sqlite` nằm sẵn trong Node 22.5+ nên không phải cài gói nào và không có
 * bước biên dịch native — chính là thứ đã làm hỏng lần thử better-sqlite3.
 * Lần đầu chạy với SQLite, dữ liệu trong `data/youpe.json` được chuyển sang tự động.
 *
 * ---
 *
 * **Vì sao mọi thứ ở đây trả về Promise, kể cả khi backend là SQLite trên máy.**
 *
 * SQLite đọc file ngay tại chỗ nên gọi đồng bộ được, và lớp này từng viết đồng bộ.
 * Nhưng mọi cơ sở dữ liệu qua mạng thì không — không có cách nào chờ một gói tin
 * mà không trả về Promise. Nếu để lớp này đồng bộ thì thêm Turso đồng nghĩa với
 * sửa lại toàn bộ nơi gọi, mà làm giữa chừng thì dễ sót.
 *
 * Nên bề mặt luôn bất đồng bộ, còn backend muốn đồng bộ hay không tuỳ nó — bên
 * dưới chỉ cần trả giá trị, `async` ở đây tự bọc thành Promise. Đổi backend từ
 * nay không phải động vào file nào khác.
 */

/** Backend được phép trả thẳng giá trị hoặc trả Promise, tuỳ nó chạy ở đâu */
type Async<T> = T | Promise<T>;

type Store = {
  findUserByEmailRow(email: string): Async<UserRow | undefined>;
  findUserById(id: number): Async<UserRow | undefined>;
  insertUser(email: string, name: string, passwordHash: string): Async<UserRow>;
  insertSession(token: string, userId: number, expiresAt: number): Async<void>;
  getSession(token: string): Async<SessionRow | undefined>;
  /**
   * Lấy luôn người dùng của một phiên, trong **một** lượt hỏi.
   *
   * Hỏi phiên rồi hỏi người dùng là hai vòng gọi tuần tự. Với cơ sở dữ liệu trên
   * máy thì không ai để ý, nhưng database đang đặt ở Tokyo và mỗi vòng tốn cỡ
   * 50–80ms — mà đường này chạy ở *mọi* request có đăng nhập.
   */
  findUserBySession(token: string): Async<{ user: UserRow; expiresAt: number } | undefined>;
  deleteSession(token: string): Async<void>;
  pruneSessions(): Async<void>;
  libraryList(userId: number, list: string): Async<LibraryRow[]>;
  libraryUpsert(userId: number, list: string, video: VideoItem): Async<void>;
  libraryRemove(userId: number, list: string, videoId: string): Async<void>;
  libraryClear(userId: number, list: string): Async<void>;
};

function sqliteAvailable(): boolean {
  try {
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
}

function tursoConfigured(): boolean {
  return !!process.env.TURSO_DATABASE_URL;
}

function pick(): { store: Store; driver: string } {
  const want = (process.env.DB_DRIVER ?? 'auto').toLowerCase();

  if (want === 'turso' || (want === 'auto' && tursoConfigured())) {
    if (!tursoConfigured()) {
      console.error('[db] DB_DRIVER=turso nhưng thiếu TURSO_DATABASE_URL — quay về kho trên máy');
    } else {
      try {
        return { store: require('./db-turso') as Store, driver: 'turso' };
      } catch (e) {
        /*
          Không im lặng rơi về kho trên máy khi người dùng đã chỉ đích danh Turso.
          Im lặng thì app vẫn chạy ngon lành nhưng ghi vào một nơi khác hẳn, và
          phải tới lúc mở máy thứ hai mới phát hiện là dữ liệu chẳng đi đâu cả.
        */
        console.error('[db] không kết nối được Turso:', e);
        if (want === 'turso') throw e;
      }
    }
  }

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

export const findUserByEmailRow = async (e: string) => store.findUserByEmailRow(e);
export const findUserById = async (id: number) => store.findUserById(id);
export const insertUser = async (e: string, n: string, h: string) => store.insertUser(e, n, h);

export const insertSession = async (t: string, u: number, x: number) => {
  await store.insertSession(t, u, x);
};
export const getSession = async (t: string) => store.getSession(t);
export const findUserBySession = async (t: string) => store.findUserBySession(t);
export const deleteSession = async (t: string) => {
  await store.deleteSession(t);
};
export const pruneSessions = async () => {
  await store.pruneSessions();
};

export const libraryList = async (u: number, l: string) => store.libraryList(u, l);
export const libraryUpsert = async (u: number, l: string, v: VideoItem) => {
  await store.libraryUpsert(u, l, v);
};
export const libraryRemove = async (u: number, l: string, v: string) => {
  await store.libraryRemove(u, l, v);
};
export const libraryClear = async (u: number, l: string) => {
  await store.libraryClear(u, l);
};
