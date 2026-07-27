# Chuyển dữ liệu tài khoản sang Turso

Turso là SQLite chạy trên máy chủ (nền libSQL). Chọn nó vì **cùng phương ngữ SQL với
`node:sqlite` đang dùng** — các câu truy vấn trong `db-sqlite.ts` giữ nguyên, chỉ đổi
cách gọi.

> **Đọc phần 4 trước khi bắt tay.** Có một điểm khiến việc này không chỉ là thay driver:
> Turso đi qua mạng nên mọi truy vấn đều bất đồng bộ, trong khi lớp lưu trữ hiện tại
> là đồng bộ.

---

## 1. Khi nào thật sự cần

Chưa cần nếu server chạy ở nhà và chỉ mình bạn dùng. Mỗi truy vấn tới Turso phải đi ra
internet rồi về, chậm hơn đọc file SQLite ngay trên máy.

Đáng chuyển khi:

- Chạy **nhiều bản ứng dụng** cùng lúc (vd một ở nhà, một trên VPS) và cần chung dữ liệu
- Muốn **sao lưu tự động** và khôi phục về một thời điểm bất kỳ
- Deploy lên nền tảng có **ổ đĩa tạm** — container khởi động lại là mất file

---

## 2. Tạo database

Cài CLI:

```powershell
# Windows
irm get.tur.so/install.ps1 | iex
```

```bash
# macOS / Linux
curl -sSfL https://get.tur.so/install.sh | bash
```

Đăng nhập và tạo:

```bash
turso auth signup          # hoặc: turso auth login
turso db create youpe
```

Lấy hai thứ cần cho `.env`:

```bash
turso db show youpe --url
turso db tokens create youpe
```

Kết quả có dạng:

```
libsql://youpe-tenban.turso.io
eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

Đưa vào `youpe-web/.env`:

```
DB_DRIVER=turso
TURSO_URL=libsql://youpe-tenban.turso.io
TURSO_TOKEN=eyJhbGciOiJFZERTQSIs...
```

**Không đẩy `.env` lên git.** Token này cho toàn quyền đọc ghi. File đã nằm trong
`.gitignore` ở gốc, kiểm tra lại cho chắc.

---

## 3. Cài thư viện

```bash
cd youpe-web
npm i @libsql/client
```

Thư viện thuần JavaScript, không có bước biên dịch native — khác hẳn `better-sqlite3`
đã làm hỏng lần cài trước.

---

## 4. Phần bắt buộc phải sửa: đồng bộ thành bất đồng bộ

Đây là điểm mấu chốt, không né được.

`node:sqlite` đọc file ngay trên máy nên gọi được kiểu đồng bộ:

```ts
export function findUserById(id: number): UserRow | undefined {
  return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}
```

Turso đi qua mạng nên bắt buộc:

```ts
export async function findUserById(id: number): Promise<UserRow | undefined> {
  const rs = await client.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  return toUser(rs.rows[0]);
}
```

Kéo theo ba chỗ phải sửa:

| File | Việc |
|---|---|
| `src/lib/db.ts` | Kiểu `Store` chuyển hết sang `Promise<...>` |
| `src/lib/auth.ts` | `userFromToken`, `findUserByEmail`, `createUser`, `createSession` thành `async` |
| `src/app/api/auth/*`, `src/app/api/library/route.ts` | Thêm `await` ở các lời gọi |

Tin tốt: các route đều đã là `async` sẵn, nên chủ yếu là thêm `await` chứ không phải
viết lại logic.

Cách làm gọn nhất là **đổi cả ba backend sang async cùng lúc** — `db-json.ts` và
`db-sqlite.ts` chỉ cần bọc `async` là xong, không mất gì. Như vậy `db.ts` chỉ còn một
kiểu giao diện duy nhất thay vì hai.

---

## 5. Tạo bảng

Turso không tự chạy `CREATE TABLE` như bản local. Chạy một lần:

```bash
turso db shell youpe
```

Rồi dán:

```sql
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
```

---

## 6. Chuyển dữ liệu đang có

File local nằm ở `youpe-web/data/youpe.sqlite`. Đẩy lên:

```bash
cd youpe-web
sqlite3 data/youpe.sqlite .dump > dump.sql
turso db shell youpe < dump.sql
```

Không có `sqlite3` thì bỏ qua bước này, đăng ký lại tài khoản cũng nhanh.

---

## 7. Bản sao đọc tại chỗ — thứ đáng giá nhất của Turso

`@libsql/client` cho phép giữ một bản sao trên đĩa, **đọc ngay tại máy còn ghi thì
đồng bộ lên máy chủ**:

```ts
const client = createClient({
  url: 'file:data/youpe-replica.sqlite',
  syncUrl: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
  syncInterval: 60,
});
```

Nhờ vậy vừa nhanh như SQLite local, vừa có sao lưu và dùng chung được giữa nhiều máy.
Nếu đã chuyển sang Turso thì nên bật chế độ này thay vì đọc thẳng qua mạng.

---

## 8. Giá

Gói miễn phí hiện đủ rộng cho dự án cá nhân: nhiều database, hàng tỷ lượt đọc mỗi
tháng, vài GB dung lượng. Dữ liệu của youpe chỉ là tài khoản và lịch sử xem — vài MB.

Giá có thể đã đổi, xem lại tại <https://turso.tech/pricing>.

---

## 9. Trước khi bắt đầu

Đo thử xem có đáng không. Nếu server chạy ở nhà và mọi thứ đang mượt thì việc chuyển
sang Turso **làm mọi truy vấn chậm đi**, đổi lấy khả năng đồng bộ mà bạn có thể chưa cần.

Cách kiểm tra rẻ nhất: bật đồng hồ đo quanh vài lời gọi trong `db-sqlite.ts`. Nếu chúng
tính bằng phần nghìn giây thì nút thắt không nằm ở database, và công sức bỏ ra nên dành
cho chỗ khác.
