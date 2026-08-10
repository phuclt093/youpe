# Đưa dữ liệu lên cloud DB

Ghi chú khảo sát, tháng 8/2026. Mục tiêu: thay/bổ sung lớp lưu trữ hiện tại
(`src/lib/db.ts`) bằng một cơ sở dữ liệu đặt trên cloud, để phát triển các tính
năng cần dữ liệu dùng chung giữa nhiều máy.

## 1. Đang có gì

| Thành phần | Hiện trạng |
|---|---|
| Lớp chọn backend | `src/lib/db.ts` — `DB_DRIVER=auto\|sqlite\|json` |
| Backend | `db-sqlite.ts` (`node:sqlite`, Node ≥ 22.5) và `db-json.ts` |
| Bảng | `users`, `sessions`, `library(user_id, list, video_id, payload, saved_at)` |
| Nơi đặt file | `YOUPE_DATA_DIR` hoặc `./data` |

Chỉ **hai** file tiêu thụ lớp này:

- `src/lib/auth.ts`
- `src/app/api/library/route.ts`

### Rào cản kỹ thuật lớn nhất — và nó không nằm ở nhà cung cấp

Interface `Store` trong `db.ts` hiện **hoàn toàn đồng bộ**:

```ts
findUserByEmailRow(email: string): UserRow | undefined;
libraryList(userId: number, list: string): LibraryRow[];
```

`node:sqlite` chạy được như vậy vì nó đọc file ngay tại chỗ. **Mọi** cơ sở dữ
liệu qua mạng đều bất đồng bộ, kể cả bản sao nhúng của Turso. Nên việc đầu tiên
phải làm, trước khi bàn chọn ai, là chuyển `Store` sang `Promise` và sửa hai file
tiêu thụ. Đây là công đoạn tốn công nhất của cả dự án; đổi nhà cung cấp sau đó chỉ
là viết thêm một file `db-<tên>.ts`.

Tin tốt: phạm vi ảnh hưởng nhỏ. Cả `auth.ts` lẫn `api/library/route.ts` đều đã
nằm trong ngữ cảnh `async` sẵn (route handler của Next), nên chủ yếu là rắc thêm
`await`.

## 2. Câu hỏi phải trả lời trước

Kiến trúc quyết định lựa chọn, không phải bảng giá.

**A. Mỗi máy chạy một bản desktop riêng** (như hiện tại). Nếu nhúng thẳng thông
tin kết nối DB vào bản cài, thì **bất kỳ ai cài app cũng đọc được nó** và có toàn
quyền trên cơ sở dữ liệu chung. Cách xử lý:

- Máy người dùng chỉ nói chuyện với SQLite local; đồng bộ qua một API do bạn dựng
  và giữ khoá ở phía server. An toàn, nhưng phải nuôi thêm một server.
- Hoặc mỗi người dùng một database riêng kèm token riêng — mô hình
  "database-per-user" mà Turso làm sẵn (100 DB ở gói miễn phí).

**B. Một server chung, người dùng vào bằng trình duyệt.** Đơn giản nhất: khoá nằm
trong biến môi trường trên server, không ai thấy. Đổi lại mất tính chất chạy được
ngoại tuyến.

Chưa chốt A hay B thì chưa nên viết dòng code nào.

## 3. So sánh

### Turso — khuyến nghị nếu giữ mô hình desktop

Nền tảng libSQL, tức là SQLite. Điểm hợp với youpe:

- **Bản sao nhúng (embedded replicas)**: một file SQLite thật nằm trên máy người
  dùng, đọc/ghi ở tốc độ local, kể cả khi mất mạng, rồi tự đồng bộ lên đám mây.
  Đúng hình dạng của một app desktop — không đánh đổi cái đang chạy tốt.
- **Lược đồ hiện tại dùng lại gần như nguyên vẹn**. Không phải dịch SQL sang
  Postgres, không phải nghĩ lại kiểu dữ liệu.
- Nhiều database rẻ, hợp mô hình mỗi người một DB.

Gói miễn phí: 100 database · 5 GB dung lượng · 500 triệu dòng đọc/tháng · 10
triệu dòng ghi/tháng · 3 GB đồng bộ/tháng · khôi phục theo thời điểm 1 ngày.
Gói Developer 4,99 $/tháng: database không giới hạn, 9 GB, 2,5 tỉ dòng đọc.

Lưu ý: **dòng ghi 10 triệu/tháng** mới là trần dễ chạm trước, không phải dung
lượng. Ghi tiến độ xem mỗi vài giây cho mỗi video là đủ để đốt sạch — phải gộp
lại rồi ghi theo lô.

### Neon — khuyến nghị nếu chuyển sang server chung

Postgres không máy chủ, tự ngủ khi rảnh.

- Miễn phí: 0,5 GB/dự án · 100 CU-giờ/dự án · 5 GB băng thông ra · ngủ sau 5 phút.
  **Chạm bất kỳ hạn mức nào là compute bị treo tới tháng sau** — không hợp làm
  chỗ dựa cho một bản phát hành thật.
- Trả theo dùng (gói Launch): 0,106 $/CU-giờ + 0,35 $/GB-tháng, không có mức tối
  thiểu hằng tháng.
- Ngủ rồi thì lần gọi đầu tiên có độ trễ khởi động lại. Với một app xem video mà
  người dùng mở lên là muốn thấy ngay thì đây là điểm trừ có thật.
- Có sẵn phần xác thực (60 nghìn người dùng hoạt động/tháng ở gói miễn phí). Nếu
  định bỏ `users`/`sessions` tự viết thì đây là lý do đáng cân nhắc.

### Supabase

Postgres kèm sẵn xác thực, lưu trữ tệp, realtime. Gói miễn phí quanh mức 500 MB
Postgres. Vấn đề: giá trị lớn nhất của Supabase nằm ở đống dịch vụ ăn theo, mà
youpe **đã tự viết xác thực rồi**. Chọn Supabase lúc này là trả tiền cho thứ
không dùng. Chỉ đáng nếu sau này muốn thêm bình luận thời gian thực hoặc kho ảnh.

## 4. Đã dựng sẵn — cách chạy thử

Đã chốt Turso và cài xong driver. Các bước để có một cơ sở dữ liệu chạy được:

### Bước 1 — tạo database

1. Đăng ký ở <https://turso.tech> (GitHub, không cần thẻ).
2. Trong bảng điều khiển bấm **Create Database**, chọn vùng gần nhất
   (Singapore hoặc Tokyo cho người dùng ở Việt Nam).
3. Mở database vừa tạo, chép **Database URL** — dạng
   `libsql://<tên>-<tài khoản>.turso.io`.
4. Tab **Tokens** → tạo token mới, chép lại. Token chỉ hiện một lần.

Hoặc bằng dòng lệnh:

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create youpe --location sin
turso db show youpe --url
turso db tokens create youpe
```

### Bước 2 — cắm vào app

Thêm vào `youpe-web/.env.local`:

```
TURSO_DATABASE_URL=libsql://youpe-taikhoancuaban.turso.io
TURSO_AUTH_TOKEN=ey...
```

Không cần đặt `DB_DRIVER` — hễ thấy `TURSO_DATABASE_URL` là app tự chuyển sang
Turso. Chạy lại và tìm dòng này trong log:

```
[db] Turso sẵn sàng
[db] đang dùng turso
```

Bảng được dựng tự động lần chạy đầu. Muốn quay về kho trên máy thì xoá hai biến
đó đi, hoặc đặt `DB_DRIVER=sqlite`.

### Bước 3 — kiểm tra kết nối

```bash
cd youpe-web
npm run db:check
```

Script này nối thẳng tới Turso, không cần dựng app. Kết quả mong đợi lần đầu:

```
→ Đang nối tới libsql://youpe-....turso.io
✓ Nối được (180ms)
· Chưa có bảng nào — bình thường nếu app chưa chạy lần nào.
```

Chạy app một lần rồi kiểm lại thì sẽ thấy ba bảng kèm số dòng.

Sai ở đâu thì script nói rõ ở đó: thiếu biến, sai token, hay database đã bị xoá.

### Bước 4 — kiểm chứng dữ liệu thật

Đăng ký một tài khoản, thêm vài video vào Xem sau, rồi:

```bash
turso db shell youpe "SELECT email FROM users"
turso db shell youpe "SELECT list, COUNT(*) FROM library GROUP BY list"
```

Thấy dữ liệu ở đó là xong. Mở app trên máy thứ hai với cùng hai biến môi trường,
đăng nhập cùng tài khoản — thư viện phải giống hệt.

### Những gì đã thay đổi trong mã nguồn

| File | Thay đổi |
|---|---|
| `src/lib/db.ts` | Bề mặt chuyển sang bất đồng bộ; thêm nhánh chọn `turso` |
| `src/lib/db-turso.ts` | Mới — driver libSQL |
| `src/lib/auth.ts` | `createSession`, `destroySession`, `userFromToken`, `createUser` thành `async` |
| `src/app/api/auth/*` · `src/app/api/library/route.ts` | Thêm `await` |
| `.env.example` | Hai biến Turso |

`db-sqlite.ts` và `db-json.ts` **không đổi một dòng nào** — bề mặt bất đồng bộ
nhận cả backend đồng bộ.

### Hai điều cần biết trước khi phát hành thật

- **Token nằm trong biến môi trường của server, đừng nhét vào bản cài desktop.**
  Ai cầm token là có toàn quyền trên cơ sở dữ liệu: đọc email, hàm băm mật khẩu,
  toàn bộ phiên đăng nhập của mọi người. Bản đóng gói gửi cho người khác thì phải
  chạy qua một server do bạn giữ, hoặc mỗi người một database riêng.
- **Driver dùng cửa vào `@libsql/client/web`, cố ý.** Cửa vào mặc định kéo theo
  gói nhị phân biên dịch sẵn — đúng loại đã làm hỏng lần thử `better-sqlite3` và
  làm bản đóng gói phình to. Bản `/web` thuần JavaScript, đổi lại không dùng được
  bản sao nhúng (chưa cần, vì cả nhà đang dùng chung một database).

## 5. Việc còn lại

- **Gộp ghi theo lô trước khi đưa tiến độ xem lên cloud.** Hiện tiến độ xem còn
  nằm ở `localStorage`, chưa chạm tới đây. Ngày nào đưa lên thì phải gom lại rồi
  ghi một lần — ghi mỗi vài giây cho mỗi video là đủ đốt sạch 10 triệu dòng ghi
  mỗi tháng của gói miễn phí. Trần này chạm trước dung lượng rất xa.
- **Đo số dòng ghi thực tế** sau một ngày dùng bình thường, đối chiếu với hạn mức.
- **Dọn phiên hết hạn.** Bản trên máy dọn ngay lúc nạp module; bản Turso cố ý
  không làm vậy vì mỗi lần khởi động lại là một lượt ghi tính tiền. Cần một chỗ
  gọi `pruneSessions()` theo lịch, hoặc gọi kèm lúc đăng nhập.
- **Quyết định giữ hay bỏ phần xác thực tự viết.** Neon và Supabase đều có sẵn
  phần này; Turso thì không. Tự viết vẫn đang chạy tốt nên chưa gấp.

## Nguồn

- [Turso — Bảng giá](https://turso.tech/pricing)
- [Turso — Embedded Replicas](https://docs.turso.tech/features/embedded-replicas/introduction)
- [Turso — Local-First SQLite, Cloud-Connected](https://turso.tech/blog/local-first-cloud-connected-sqlite-with-turso-embedded-replicas)
- [Neon — Bảng giá](https://neon.com/pricing)
- [Turso vs Neon vs Supabase for Indie Hackers in 2026](https://devtoolpicks.com/blog/turso-vs-neon-vs-supabase-indie-hackers-2026)
- [Database Free Tier Comparison 2026](https://agentdeals.dev/database-free-tier-comparison-2026)
