import type { VideoItem } from './types';
import type { UserRow, SessionRow, LibraryRow } from './db-json';

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
 * Nhưng mọi cơ sở dữ liệu qua mạng thì không. Nếu để lớp này đồng bộ thì thêm
 * Turso đồng nghĩa với sửa lại toàn bộ nơi gọi, mà làm giữa chừng thì dễ sót.
 *
 * Nên bề mặt luôn bất đồng bộ, còn backend muốn đồng bộ hay không tuỳ nó — bên
 * dưới chỉ cần trả giá trị, `async` ở đây tự bọc thành Promise.
 *
 * ---
 *
 * **Vì sao nạp backend bằng `await import()` chứ không phải `require()`.**
 *
 * Bản đầu dùng `require('./db-turso')`. Module nạp xong, in ra "Turso sẵn sàng",
 * nhưng đối tượng trả về **không có hàm nào cả** — lần chạm database thật đầu tiên
 * ném ra `store.findUserByEmailRow is not a function`. Lý do: `db-turso.ts` phụ
 * thuộc `@libsql/client/web`, một gói ESM thuần; khi trong cây phụ thuộc có ESM,
 * webpack biến module thành "async module" và `require()` không còn trả về bảng
 * export nữa.
 *
 * Lỗi kiểu này rất khó lần vì nó nằm im: server khởi động sạch sẽ, log đẹp, và chỉ
 * nổ khi có người bấm Đăng ký. Nên bên dưới còn kiểm tra hình dạng module ngay lúc
 * nạp — thà hỏng ồn ào lúc khởi động.
 */

/** Backend được phép trả thẳng giá trị hoặc trả Promise, tuỳ nó chạy ở đâu */
type Async<T> = T | Promise<T>;

type Store = {
  findUserByEmailRow(email: string): Async<UserRow | undefined>;
  findUserById(id: number): Async<UserRow | undefined>;
  insertUser(email: string, name: string, passwordHash: string): Async<UserRow>;
  insertSession(token: string, userId: number, expiresAt: number): Async<void>;
  getSession(token: string): Async<SessionRow | undefined>;
  deleteSession(token: string): Async<void>;
  /**
   * Lấy luôn người dùng của một phiên, trong **một** lượt hỏi.
   *
   * Hỏi phiên rồi hỏi người dùng là hai vòng gọi tuần tự. Với cơ sở dữ liệu trên
   * máy thì không ai để ý, nhưng database đang đặt ở Tokyo và mỗi vòng tốn cỡ
   * 50–80ms — mà đường này chạy ở *mọi* request có đăng nhập.
   */
  findUserBySession(token: string): Async<{ user: UserRow; expiresAt: number } | undefined>;
  pruneSessions(): Async<void>;
  libraryList(userId: number, list: string): Async<LibraryRow[]>;
  libraryUpsert(userId: number, list: string, video: VideoItem): Async<void>;
  libraryRemove(userId: number, list: string, videoId: string): Async<void>;
  libraryClear(userId: number, list: string): Async<void>;
};

const REQUIRED = [
  'findUserByEmailRow', 'findUserById', 'insertUser',
  'insertSession', 'getSession', 'deleteSession', 'findUserBySession', 'pruneSessions',
  'libraryList', 'libraryUpsert', 'libraryRemove', 'libraryClear',
] as const;

/** Module có đúng hình dạng một Store không — bắt lỗi nạp ngay, đừng để tới lúc dùng */
function asStore(mod: any, ten: string): Store {
  const thieu = REQUIRED.filter((k) => typeof mod?.[k] !== 'function');
  if (thieu.length) {
    throw new Error(`driver ${ten} thiếu hàm: ${thieu.join(', ')}`);
  }
  return mod as Store;
}

function sqliteAvailable(): boolean {
  try {
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
}

const tursoConfigured = () => !!process.env.TURSO_DATABASE_URL;

async function load(): Promise<{ store: Store; driver: string }> {
  const want = (process.env.DB_DRIVER ?? 'auto').toLowerCase();

  if (want === 'turso' || (want === 'auto' && tursoConfigured())) {
    if (!tursoConfigured()) {
      console.error('[db] DB_DRIVER=turso nhưng thiếu TURSO_DATABASE_URL — quay về kho trên máy');
    } else {
      try {
        const store = asStore(await import('./db-turso'), 'turso');
        console.info('[db] đang dùng turso');
        return { store, driver: 'turso' };
      } catch (e) {
        /*
          Không im lặng rơi về kho trên máy khi người dùng đã chỉ đích danh Turso.
          Im lặng thì app vẫn chạy ngon lành nhưng ghi vào một nơi khác hẳn, và
          phải tới lúc mở máy thứ hai mới phát hiện là dữ liệu chẳng đi đâu cả.
        */
        console.error('[db] không dùng được Turso:', e);
        if (want === 'turso') throw e;
      }
    }
  }

  if (want !== 'json' && (want === 'sqlite' || sqliteAvailable())) {
    try {
      const store = asStore(await import('./db-sqlite'), 'sqlite');
      console.info('[db] đang dùng sqlite');
      return { store, driver: 'sqlite' };
    } catch (e) {
      console.error('[db] không mở được SQLite, quay về JSON:', e);
    }
  }

  if (want === 'sqlite') {
    console.warn('[db] DB_DRIVER=sqlite nhưng node:sqlite không dùng được — cần Node 22.5 trở lên');
  }

  const store = asStore(await import('./db-json'), 'json');
  console.info('[db] đang dùng json');
  return { store, driver: 'json' };
}

/*
  Chỉ nạp một lần cho cả tiến trình. Giữ ở globalThis vì Next dev nạp lại module
  mỗi lần sửa file — không giữ thì mỗi lần lưu là mở thêm một kết nối.

  **Tên khoá phải là duy nhất.** Bản đầu đặt là `__youpeStore`, trùng đúng khoá
  mà `db-json.ts` đã dùng cho trạng thái trong RAM của nó. Hậu quả: `db.ts` gán
  vào đó một Promise trước, rồi `db-json.ts` nạp sau đọc trúng Promise ấy, tưởng
  là kho dữ liệu của mình, và `pruneSessions()` ở cuối module gọi
  `Object.entries(promise.sessions)` → "Cannot convert undefined or null to
  object" ngay lúc nạp module, trước khi chạm tới câu SQL nào.

  Lỗi đó chỉ lộ ra ở bản đóng gói: Electron 33 chạy Node 20, không có
  `node:sqlite`, nên lớp chọn backend mới rơi xuống `db-json.ts` — còn máy phát
  triển chạy Node 22.5+ thì không bao giờ nạp file đó.

  Khoá đang dùng: `__youpeStore` (db-json), `__youpeSqlite` (db-sqlite),
  `__youpeTurso` + `__youpeTursoReady` (db-turso), `__youpeCacheLoaded` (sources).
*/
const g = globalThis as any;
const ready = (): Promise<{ store: Store; driver: string }> => (g.__youpeDbLoader ??= load());

/** Backend nào đang chạy — chỉ dùng để hiển thị, nên mới trả Promise */
export const getDbDriver = async () => (await ready()).driver;

/* ---------------- API dùng chung ---------------- */

const s = async () => (await ready()).store;

export const findUserByEmailRow = async (e: string) => (await s()).findUserByEmailRow(e);
export const findUserById = async (id: number) => (await s()).findUserById(id);
export const insertUser = async (e: string, n: string, h: string) => (await s()).insertUser(e, n, h);

export const insertSession = async (t: string, u: number, x: number) => {
  await (await s()).insertSession(t, u, x);
};
export const getSession = async (t: string) => (await s()).getSession(t);
export const findUserBySession = async (t: string) => (await s()).findUserBySession(t);
export const deleteSession = async (t: string) => {
  await (await s()).deleteSession(t);
};
export const pruneSessions = async () => {
  await (await s()).pruneSessions();
};

export const libraryList = async (u: number, l: string) => (await s()).libraryList(u, l);
export const libraryUpsert = async (u: number, l: string, v: VideoItem) => {
  await (await s()).libraryUpsert(u, l, v);
};
export const libraryRemove = async (u: number, l: string, v: string) => {
  await (await s()).libraryRemove(u, l, v);
};
export const libraryClear = async (u: number, l: string) => {
  await (await s()).libraryClear(u, l);
};
