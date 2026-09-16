# youpe — tài liệu bàn giao

Đọc file này trước khi làm gì. Nó ghi lại **vì sao** mọi thứ ở trạng thái hiện tại,
đặc biệt là những hướng đã thử và thất bại — để không mất công đi lại đường cũ.

Cập nhật lần cuối: 10/08/2026

> **Nhật ký tiến độ nằm ở mục 9, cuối file.** Ai vào sau thì đọc mục 9 trước để
> biết chuyện gì vừa xảy ra, rồi quay lại các mục trên để hiểu vì sao.

---

## 1. Mục tiêu

Xem YouTube không quảng cáo, giao diện bám sát YouTube. Ba đầu ra:

| Thư mục | Là gì | Trạng thái |
|---|---|---|
| `youpe-web/` | Next.js 15 — vừa là giao diện web, vừa là server API cho mọi client | Chạy được |
| `youpe-desktop/` | Vỏ Electron cho Windows, macOS và Linux (deb + AppImage) | Windows chạy được; Linux chưa build thử |
| `youpe-tv/` | Project Android, ba module — xem bên dưới | Chưa biên dịch thử |

Trong `youpe-tv/` (tên thư mục giữ nguyên từ lúc đầu, giờ đã rộng hơn):

| Module | Là gì |
|---|---|
| `:core` | Lõi dùng chung — gọi API, mô hình dữ liệu, Media3, phát nền, tải offline |
| `:app` | Giao diện Android TV, điều khiển bằng remote |
| `:mobile` | Giao diện điện thoại — chạm, Shorts vuốt dọc, cửa sổ nổi, tải offline |

Hai giao diện tách riêng vì remote và ngón tay không dùng chung được bố cục, nhưng
phần khó thì giống hệt nên nằm ở `:core`.

`YMusic-...-master/` là source tham khảo ban đầu (app Android nghe nhạc), **đã bị gitignore**.
Không dùng nữa, xem mục 3.

---

## 2. Kiến trúc

```
                    ┌──────────────────────────────┐
   Trình duyệt ───► │                              │
   App desktop ───► │   youpe-web  (Next.js)       │ ──► yt-dlp ──► YouTube
   Android TV  ───► │   API + giao diện web        │ ──► InnerTube
                    │                              │ ──► Piped/Invidious
                    └──────────────────────────────┘
                              │
                       data/youpe.sqlite
```

**Điểm cốt lõi: mọi client đều gọi cùng một API.** App TV và app desktop không tự
trích xuất video — chúng chỉ đọc JSON. Muốn thêm client mới (iOS, CLI, gì cũng được)
thì chỉ cần gọi API, không phải viết lại phần khó.

### Các endpoint chính

| Endpoint | Việc |
|---|---|
| `GET /api/feed?tab=&more=` | Feed theo chủ đề, có phân trang |
| `GET /api/search?q=` | Tìm kiếm |
| `GET /api/suggest?q=` | Gợi ý gõ |
| `GET /api/video/[id]` | Metadata: tiêu đề, kênh, mô tả |
| `POST /api/related/[id]` | Gợi ý đã trộn nhiều nguồn |
| `GET /api/streams/[id]` | **Quan trọng nhất** — danh sách luồng phát |
| `GET /api/manifest/[id]` | Manifest DASH/HLS (chỉ khi dựng được) |
| `GET /api/stream?u=` | Proxy tới googlevideo, hỗ trợ Range |
| `GET /api/debug/[id]` | **Công cụ gỡ lỗi số một** — nguồn nào còn sống |
| `/api/auth/*`, `/api/library` | Tài khoản nội bộ |

---

## 3. Những hướng đã thử và **thất bại** — đừng thử lại

Đây là phần quan trọng nhất của tài liệu này.

### 3.1 InnerTube trực tiếp (`youtubei.js`) — chết vì SABR

Hướng đầu tiên, dựa theo cách app YMusic làm. Kết quả: YouTube trả `status: OK` với
đầy đủ 28 định dạng nhưng **cắt sạch URL**, chỉ để lại `server_abr_streaming_url`.
Đây là SABR (server-side ABR). Đã thử cả 7 client — `TV_EMBEDDED`, `WEB_EMBEDDED`,
`TV`, `IOS`, `ANDROID`, `MWEB`, `WEB` — tất cả đều bị chặn như nhau.

`youtubei.js` vẫn dùng tốt cho **metadata**: feed, tìm kiếm, bình luận, kênh, gợi ý.
Chỉ riêng phần lấy URL luồng là hỏng.

### 3.2 Piped / Invidious — cả hệ sinh thái đang gãy

Đây chính là cách YMusic né: đọc `innertube/requests/Player.kt` sẽ thấy khi
`playabilityStatus != "OK"` nó gọi một instance Piped để mượn URL. Nhưng thử 8 instance
thì Piped trả 502/500 (chúng cũng bị SABR ở đầu trên), Invidious trả 401/403 (đã khoá
API công khai).

Code vẫn còn ở `src/lib/piped.ts` làm tầng dự phòng cuối, nhưng đừng trông đợi.

### 3.3 `better-sqlite3` — hỏng vì phải biên dịch native

Cài là gãy ngay, và sẽ còn gãy mỗi khi đổi phiên bản Node hoặc build Docker.
Đã thay bằng `node:sqlite` (có sẵn trong Node 22.5+, không biên dịch gì).

### 3.4 Bọc WebView cho app TV — không chọn

Vì trò đồng bộ hai thẻ media (mục 4.2) sẽ giật nặng trên phần cứng TV box.
Media3 có `MergingMediaSource` làm việc đó ở tầng native.

---

## 4. Những chỗ dễ hiểu nhầm trong code

### 4.1 Chuỗi ba nguồn lấy luồng (`src/lib/sources.ts`)

Thứ tự: **yt-dlp → InnerTube → Piped/Invidious**. Nguồn nào vừa thắng được nhớ lại
và đẩy lên đầu cho video sau. Thực tế hiện nay gần như luôn là yt-dlp.

yt-dlp là **bắt buộc**, không phải tuỳ chọn. Cài bằng `npm run setup:ytdlp` — tải file
về `youpe-web/bin/`, không đụng PATH.

### 4.2 Chế độ "2 luồng" trong `Player.tsx`

yt-dlp trả URL nhưng **không có `init_range`/`index_range`**, mà thiếu hai thứ này thì
không dựng được manifest DASH. Nên trình phát rơi xuống chế độ 2 luồng: một thẻ
`<video>` phát luồng hình, một thẻ `<audio>` ẩn phát luồng tiếng, đồng bộ theo sự kiện
và tự sửa lệch mỗi giây.

**Hệ quả quan trọng: chế độ này không có ABR.** Không tự hạ chất lượng khi mạng yếu.
Vì vậy chất lượng khởi đầu bị chặn trần 720p — chọn ngay bản cao nhất (có video tới
2160p) sẽ khiến trình duyệt phải nạp rất nhiều mới phát được.

### 4.3 Vì sao phải proxy mọi byte video

URL `googlevideo.com` không trả CORS header và bị khoá theo IP. Trình duyệt gọi thẳng
sẽ bị chặn. Nên mọi dữ liệu video đi qua `/api/stream`.

**Đây là lý do băng thông là chi phí chính khi host** — không phải CPU.

### 4.4 Bộ trộn gợi ý (`src/lib/recommend.ts`)

Trộn 4 nguồn theo trọng số: gợi ý của YouTube (3), chủ đề từ keywords (2), từ khoá lặp
lại trong lịch sử xem (2), xu hướng (1).

Thứ thật sự phá thế một kênh chiếm hết danh sách **không phải việc trộn nguồn**, mà là
**chặn trần 2 video mỗi kênh** lúc xen kẽ (`CHANNEL_CAP`).

### 4.5 Video trực tiếp đi đường riêng

Live không có file hoàn chỉnh để tải theo Range, YouTube phát bằng HLS. yt-dlp để
đường dẫn master playlist ở `manifest_url` của các format m3u8.

Chỗ tinh tế: file `.m3u8` chứa đường dẫn tới playlist con và segment. Để nguyên thì
trình duyệt gọi thẳng googlevideo và bị CORS chặn. Nên `/api/stream` **nhận diện mọi
phản hồi kiểu m3u8 rồi viết lại từng đường dẫn** thành lời gọi ngược lại chính nó —
nhờ vậy playlist con, segment và khoá mã hoá đều tự động đi đúng đường, không phải
xử lý riêng từng loại.

Live **không được cache** vì URL hết hạn rất nhanh.

### 4.6 Vì sao menu chất lượng từng bị trùng

yt-dlp trả cùng một độ phân giải nhiều lần vì YouTube mã hoá bằng nhiều codec
(H.264, VP9, AV1). Menu hiện "480p" ba lần. `/api/streams` gộp theo `height`, mỗi mức
giữ một bản và ưu tiên H.264/mp4 — tương thích rộng nhất, giải mã bằng phần cứng
trên gần như mọi máy.

### 4.7 Lấy video từ feed: dùng `videosFrom`, không tự duyệt cây

Các lớp kế thừa `Feed` của youtubei.js — `Channel`, `Search`, `HomeFeed` — **không giữ
dữ liệu ở `contents`** mà ở một `memo` nội bộ, phơi ra qua getter `videos`.

Hàm `collectVideos` tự viết duyệt theo `contents/items/results` nên với các lớp này
sẽ trả về rỗng. Đây chính là lý do trang kênh từng trống trơn dù metadata vẫn hiện đủ.

`videosFrom()` thử getter `videos` trước, rỗng mới rơi xuống `collectVideos`. Dùng cho
mọi lời gọi qua API bọc sẵn; `collectVideos` chỉ còn dùng cho dữ liệu thô từ
`actions.execute()`.

### 4.8 Ba kiểu node video, không phải một

YouTube trả về card video bằng nhiều kiểu node khác nhau, `mapVideo()` phải xử lý riêng:

| Kiểu | Id ở đâu | Tiêu đề ở đâu |
|---|---|---|
| `Video`, `GridVideo`, `CompactVideo` | `id` | `title` |
| `LockupView` (card kiểu mới) | `content_id` | `metadata.title` |
| `ShortsLockupView` | `on_tap_endpoint.payload.videoId` | `overlay_metadata.primary_text` |

Với `LockupView`, tên kênh và lượt xem nằm trong `metadata.metadata.metadata_rows` —
mảng lồng nhau hai tầng. Kênh có tick xanh đôi khi đẩy mọi thứ xuống một hàng, nên
`lockupRows()` phải dò chứ không lấy cứng theo chỉ số.

`ShortsLockupView` **không có `id`** — đó là lý do tab Shorts từng trống.

### 4.9 Bẫy của hàm `txt()`

Bản đầu có `v?.toString?.()` làm phương án cuối. Gặp object không có trường `text` thì
nó trả về đúng chuỗi `"[object Object]"` rồi in thẳng lên giao diện. Giờ chỉ nhận chuỗi
thật hoặc mảng `runs`, còn lại trả rỗng.

### 4.10 Gợi ý tìm kiếm phải tự gọi, không dùng youtubei.js

`yt.getSearchSuggestions()` gọi `/complete/search` với `client=youtube`, endpoint này
trả nội dung mã hoá **ISO-8859-1**. Theo chuẩn fetch, `response.text()` **luôn giải mã
bằng UTF-8** bất kể charset khai báo trong header — nên tiếng Việt có dấu vỡ thành ký
tự lỗi.

`/api/suggest` gọi thẳng với `client=firefox` (trả JSON thuần, tôn trọng `oe=utf-8`),
đọc theo byte rồi tự giải mã, và loại bỏ dòng nào còn sót ký tự thay thế.

### 4.11 Hai chiến lược trích xuất — và cái bẫy chạy hai lượt

`fast` dùng bộ player client mặc định của yt-dlp, `all` quét mọi client nên chậm hơn
nhưng chắc ăn. `preferred` nhớ cái nào vừa thắng để lần sau dùng thẳng.

**Bài học đắt giá:** bản đầu thêm cờ `--extractor-args youtube:player_skip=webpage,configs`
cho lượt nhanh, tưởng bớt được 2 request. Thực tế cờ đó khiến lượt nhanh **luôn hỏng**,
nên video nào cũng chạy yt-dlp hai lượt — 7 giây cộng 9 giây thành 16 giây.

Dấu hiệu nhận ra trong log: chỉ thấy dòng có `quét mọi client`, không thấy dòng nào của
lượt nhanh. Vì log chỉ in khi thành công. Giờ **in cả khi hỏng**, kèm `HỎNG` ở cuối,
để không bao giờ mù thông tin kiểu đó nữa.

### 4.12 Hai đường chạy yt-dlp

| Đường | Khi nào | Chi phí khởi động |
|---|---|---|
| Worker Python thường trú | Máy sẵn có Python kèm gói `yt_dlp` | 0 — nạp một lần lúc khởi động |
| Gọi file `yt-dlp.exe` | Mặc định | 1–4 giây mỗi video |

Worker chỉ là **tối ưu thêm cho máy phát triển, không phải yêu cầu**. Người dùng cuối
cài app không phải cài Python — `yt-dlp.exe` đã gói sẵn trong bản đóng gói.

`yt-dlp.exe` là gói PyInstaller: mỗi lần chạy phải giải nén vào thư mục tạm rồi nạp
Python từ đầu. Worker (`scripts/ytdlp_worker.py` + `src/lib/ytdlp-worker.ts`) nạp một
lần rồi nằm chờ, trao đổi JSON qua stdin/stdout.

Tự dò, không cần cấu hình. Log lúc khởi động cho biết đang chạy đường nào, và log mỗi
video có hậu tố `(worker)` hoặc `(exe)`.

Worker hỏng thì tự quay về gọi exe, không làm chết luồng.

### 4.13 Trò chuyện trực tiếp đi qua SSE

`info.getLiveChat()` trả về một EventEmitter tự hỏi YouTube theo chu kỳ — đối tượng
sống lâu ở server, không gói vào một lời gọi HTTP bình thường được.

Nên `/api/livechat/[id]` dùng Server-Sent Events: giữ kết nối mở, có tin nào đẩy ngay.
Trình duyệt đóng tab thì `req.signal` bắn abort và ta gọi `chat.stop()` — **bỏ bước này
là tiến trình hỏi vòng chạy mãi**, rò rỉ dần theo mỗi lần mở video.

Chat chỉ đọc. Gửi tin cần tài khoản Google đã đăng nhập, mà app dùng tài khoản nội bộ
riêng nên không làm được.

### 4.14 Trình phát sống ngoài cây trang (`PlayerHost.tsx`)

Muốn xem tiếp trong cửa sổ nhỏ khi rời trang xem thì thẻ `<video>` **không được
unmount**. Để trình phát nằm trong cây của trang xem là chuyển trang React gỡ nó đi,
video nạp lại từ đầu.

Cách làm: tạo một thẻ div ngoài React ngay trong `document.body`, dùng `createPortal`
render trình phát vào đó. Mục tiêu portal không đổi nên React không bao giờ unmount.
Đổi vị trí thì **di chuyển chính thẻ div** bằng `appendChild` — trình duyệt coi đó là
thao tác chuyển chỗ chứ không phải xoá rồi tạo lại, nên video chạy liên tục.

`PlayerSlot` trên trang xem chỉ là khung rỗng đúng tỉ lệ; trình phát thật được chuyển
vào đấy. Slot biến mất là tự chuyển sang chế độ nhỏ.

### 4.15 Phát khi cửa sổ bị ẩn

Chromium mặc định hãm mọi thứ khi cửa sổ ẩn hoặc bị che — timer chậm lại và media bị
dừng. Với app xem video là hành vi sai. Đã tắt ở hai chỗ:

- Electron: `backgroundThrottling: false` cộng ba command-line switch trong `main.js`
- Web: nghe `visibilitychange`, nếu người dùng chưa chủ động bấm dừng thì cho chạy lại

Cả hai đều theo tuỳ chọn `playInBackground` trong trang Cài đặt.

### 4.16 Cache và gộp request

- `resolveStreams` gộp các lời gọi trùng cho cùng videoId — nếu không, trang xem và
  trình phát sẽ chạy yt-dlp **hai lần**.
- Kết quả cache 20 phút (URL googlevideo sống ~6 tiếng), **ghi cả xuống
  `data/stream-cache.json`** để khởi động lại server không mất.
- Prefetch khi rê chuột 400ms hoặc vừa nhấn, và sau 4 giây xem thì lấy sẵn video kế tiếp.
- Khi cả 7 client InnerTube cùng báo SABR, ghi nhận và bỏ qua InnerTube trong 10 phút.

---

### 4.17 Bảng màu là biến CSS, không phải mã hex

`tailwind.config.ts` không chứa mã màu nào — mọi màu đều là
`rgb(var(--yt-<tên>) / <alpha-value>)`. Biến chứa **ba số kênh màu** ("15 15 15")
chứ không phải chuỗi `#0f0f0f`, vì chỉ có vậy Tailwind mới ghép được độ mờ:
`bg-yt-elev/60` dịch ra `rgb(var(--yt-elev) / .6)`.

Đổi chủ đề = gán lại mấy biến đó lên thẻ `html` (`src/lib/theme.ts`). Không dựng
lại DOM nên video đang chạy không gián đoạn.

Hai chỗ dễ vấp:

- **Có một script chặn trong `<head>`** (`layout.tsx` gọi `themeBootScript()`).
  Không có nó thì trang luôn hiện ra bằng màu mặc định rồi mới nhảy sang chủ đề đã
  chọn — với chủ đề sáng đó là một cú loé trắng. React chạy quá muộn cho việc này.
- **`copyStyles()` trong `PlayerHost.tsx` phải chép cả `style` của `html` sang cửa
  sổ nổi.** Cửa sổ nổi có `html` riêng; chỉ chép stylesheet thì mọi
  `rgb(var(--yt-…))` bên đó rỗng tuếch.

Viết màu cứng trong `className` (kiểu `bg-white`, `hover:bg-[#3f3f3f]`) là làm hỏng
chủ đề sáng. Dùng token; thiếu token thì thêm vào `tailwind.config.ts`.

### 4.18 Xem trước khi rê chuột — ba cái bẫy đã gỡ

`VideoCard.tsx` + `src/lib/preview.ts`. Từng chậm tới mức tưởng như hỏng, vì ba
nguyên nhân chồng lên nhau:

1. **Bỏ cuộc quá sớm.** Hết 700ms mà luồng chưa nạp xong thì hàm return luôn và
   không bao giờ thử lại — lần rê chuột đầu gần như chẳng khi nào ra hình. Nay
   `warm` nằm trong danh sách phụ thuộc của effect nên nạp xong là chạy lại.
2. **Gọi `/api/streams` hai lần.** `prefetch.ts` nay giữ lại phần thân JSON
   (`getPrefetchData`), `preview.ts` dùng lại.
3. **Tải nguyên cả file.** Quan trọng nhất: googlevideo **bóp băng thông** những
   lời gọi luồng adaptive không kèm `Range`. Nay `preview.ts` gắn `&cap=<byte>`
   vào đường proxy; `/api/stream` biến nó thành `Range: bytes=0-N` **và khai lại
   `Content-Length`/`Content-Range` đúng bằng chỗ đã cắt**, để trình duyệt tưởng
   file chỉ dài ngần ấy và `loop` quay vòng sạch thay vì ăn lỗi 416.

Đừng đặt `video.currentTime = 0` trước khi có metadata — trình duyệt xếp hàng một
lượt tua, tốn thêm một vòng mạng trước khi hình đầu tiên hiện ra.

### 4.19 Lớp lưu trữ bất đồng bộ, và Turso

`src/lib/db.ts` là lớp chọn backend. Bề mặt **luôn trả `Promise`**, kể cả khi
backend là SQLite đọc file ngay tại chỗ. Cố ý: mọi cơ sở dữ liệu qua mạng đều bất
đồng bộ, để bề mặt đồng bộ thì thêm driver mới đồng nghĩa với sửa lại toàn bộ nơi
gọi. Backend được phép trả thẳng giá trị (`Async<T> = T | Promise<T>`), nên
`db-json.ts` và `db-sqlite.ts` không phải đổi một dòng nào.

| Driver | Khi nào dùng |
|---|---|
| `db-turso.ts` | Có `TURSO_DATABASE_URL` |
| `db-sqlite.ts` | `node:sqlite` chạy được (Node ≥ 22.5) |
| `db-json.ts` | Còn lại |

Ba điểm dễ vấp:

- **Khoá `globalThis` phải là duy nhất tuyệt đối.** Từng đặt khoá của `db.ts`
  trùng `__youpeStore` mà `db-json.ts` đã dùng. `db.ts` gán vào đó một Promise
  trước, `db-json.ts` nạp sau đọc trúng Promise ấy tưởng là kho của mình, rồi
  `pruneSessions()` ở cuối module gọi `Object.entries(promise.sessions)` →
  `Cannot convert undefined or null to object` **ngay lúc nạp module**, chưa chạm
  câu SQL nào. Hiện đang dùng: `__youpeDbLoader` (db.ts), `__youpeStore`
  (db-json), `__youpeSqlite`, `__youpeTurso` + `__youpeTursoReady`,
  `__youpeCacheLoaded` (sources).
- **Electron 33 chạy Node 20.18 — không có `node:sqlite`.** Nên bản đóng gói
  *không bao giờ* dùng driver sqlite: có Turso thì dùng Turso, không thì rơi
  xuống JSON. Máy phát triển chạy Node 22.5+ nên đi đường sqlite. Hệ quả: **hai
  môi trường chạy hai driver khác nhau**, và lỗi chỉ ở đường JSON sẽ không bao
  giờ lộ ra lúc dev. Đây chính là cách cái bẫy globalThis ở trên trốn được.
- **Backend nạp bằng `await import()`, tuyệt đối không dùng `require()`.** Bản đầu
  dùng `require('./db-turso')`: module nạp xong, in ra "Turso sẵn sàng", nhưng đối
  tượng trả về **không có hàm nào cả** — lần chạm database thật đầu tiên ném
  `store.findUserByEmailRow is not a function`. Lý do: `db-turso.ts` phụ thuộc
  `@libsql/client/web`, một gói ESM thuần; có ESM trong cây phụ thuộc là webpack
  biến module thành "async module" và `require()` không còn trả về bảng export.

  Lỗi này nằm im rất lâu: server khởi động sạch, log đẹp, `/api/auth/me` vẫn 200
  (vì chưa đăng nhập thì không chạm DB), chỉ nổ khi có người bấm Đăng ký. Nên
  `db.ts` còn kiểm tra hình dạng module ngay lúc nạp (`asStore`) — thà hỏng ồn ào
  lúc khởi động.
- **`db-turso.ts` nhập từ `@libsql/client/web`, không phải `@libsql/client`.** Cửa
  vào mặc định kéo theo gói nhị phân biên dịch sẵn — đúng loại đã làm hỏng lần thử
  `better-sqlite3` (mục 3.3) và làm bản đóng gói phình ra. Bản `/web` thuần
  JavaScript; đã kiểm chứng bản standalone chỉ có ~600 KB JS, không file `.node`
  nào. Đổi lại không dùng được bản sao nhúng (embedded replica).
- **`userFromToken()` dùng một câu `JOIN`,** không phải `getSession` rồi
  `findUserById`. Đường này chạy ở mọi request có đăng nhập; DB đặt ở Tokyo nên
  mỗi vòng tốn 50–80ms.
- **`pruneSessions()` ở bản Turso không tự chạy lúc nạp module** như bản SQLite.
  Mỗi lần khởi động lại tiến trình là một lượt ghi, mà Turso tính tiền theo dòng
  ghi. Chưa có chỗ nào gọi nó theo lịch — việc còn nợ.

### 4.19b Hai chế độ đồng bộ: trực tiếp và qua máy chủ

Cùng một mã nguồn chạy được hai vai, khác nhau đúng một biến ở phía client
(`src/lib/api.ts`):

| | Địa chỉ máy chủ trống | Có địa chỉ |
|---|---|---|
| Tài khoản, thư viện | server trên máy → Turso | server của bạn → Turso |
| Ai giữ token Turso | máy người dùng | chỉ server |
| Feed, tìm kiếm, **video** | server trên máy | **vẫn là server trên máy** |

**Chỉ tài khoản và thư viện đi xa.** Đây là lựa chọn có chủ đích:

- Băng thông video là chi phí lớn nhất. Để nó đi thẳng từ máy người dùng tới
  YouTube thì server của bạn chỉ chở vài KB dữ liệu thư viện.
- yt-dlp vẫn chạy bằng IP nhà của từng người. Dồn lên máy chủ là đổi sang IP
  datacenter — thứ YouTube chặn mạnh hơn hẳn (mục 3.1).

Cái giá phải trả là gọi xuyên origin:

- **Server bắt buộc chạy HTTPS.** Cookie phiên phải `SameSite=None`, mà trình
  duyệt chỉ chấp nhận `None` khi có `Secure`. Đây là ràng buộc của trình duyệt.
- `YOUPE_ALLOW_ORIGINS` bật CORS (`src/middleware.ts`) **và** đồng thời là cờ
  nhận biết "đang làm server dùng chung" để `sessionCookieOptions` hạ `SameSite`.
  Một biến, hai tác dụng — đặt nhầm trên máy cá nhân là cookie đòi HTTPS mà
  không có, đăng nhập sẽ hỏng.
- Giá trị `local` cho phép mọi `http://localhost:<cổng>`. Bắt buộc phải có cho
  app desktop: vỏ Electron xin cổng trống mỗi lần khởi động nên origin đổi liên
  tục, không thể liệt kê sẵn.
- Đăng xuất phải xoá cookie bằng **đúng bộ thuộc tính lúc đặt**, nếu không trình
  duyệt coi là cookie khác và cookie cũ vẫn nằm nguyên.

Những gì đồng bộ theo tài khoản: **lịch sử, xem sau, đã thích, kênh đăng ký,
danh sách phát**. Tất cả nằm chung bảng `library` — bảng đó thực chất là "danh
sách các thứ có id", không riêng gì video, nên kênh và danh sách phát nhét vừa y
như cũ mà khỏi dựng thêm bảng.

Cách gọi API gom ở `src/lib/sync.ts`. Trước đây chỉ `storage.ts` biết đường gọi,
nên `subs.ts` và `playlists.ts` đứng ngoài và dữ liệu chỉ nằm ở máy — đăng nhập ở
máy khác là mất sạch kênh đăng ký dù lịch sử vẫn về đủ. Thêm loại mới bây giờ chỉ
là thêm một cái tên vào `ListName` và vào `LISTS` của route.

Hai chỗ cần giữ đúng:

- **Đẩy trước rồi mới kéo** khi đăng nhập (`AuthProvider`). Ngược lại thì những
  gì làm lúc chưa đăng nhập bị bản trên server ghi đè mất.
- Route nhận **cả `item` lẫn `video`** trong body. `video` là tên cũ và app TV
  vẫn đang gửi bằng tên đó.

Chưa đồng bộ: **tiến độ xem** vẫn nằm ở `localStorage`. Đưa lên phải gộp ghi
theo lô trước, xem phần điểm yếu ở mục 6.

**Chưa kiểm chứng:** middleware có đi theo bản `output: 'standalone'` hay không.
Bản đóng gói desktop không cần — nó là *client*, middleware chỉ chạy ở phía server
dùng chung. Nhưng nếu triển khai VPS bằng cách chép `.next/standalone` thì phải
kiểm tra trước:

```bash
ls .next/standalone/.next/server/middleware-manifest.json
curl -i -X OPTIONS https://<server>/api/auth/me -H 'Origin: http://localhost:9999' \
  -H 'Access-Control-Request-Method: GET' | grep -i access-control
```

Không thấy header CORS thì chạy VPS bằng `npm run build && npm start` (không dùng
standalone) là chắc ăn.

### 4.19c Điểm nhấn chuyển sắc, và vì sao logo phải đổi

Mọi gradient dựng từ **hai màu nhấn của chủ đề đang bật** (`--yt-red` và
`--yt-blue`), không viết mã màu cứng. Nhờ vậy nó tự hợp với cả sáu bộ màu: đỏ→xanh
ở bộ mặc định, son→ngọc ở Giấy cũ, hồng→ngọc ở Hoa linh. Viết cứng một cặp đẹp
trên nền tối thì sang bộ Giấy cũ sẽ chói như đèn nháy.

Các lớp ở `globals.css`: `.grad-accent`, `.grad-text`, `.glass` (thanh trên),
`.nav-active` (mục sidebar), `.grad-ring` (viền chuyển sắc khi rê chuột), và quầng
sáng ở `body::before`.

Quầng sáng phải để **`z-index: -1`**. `position: fixed` biến nó thành phần tử được
định vị; với `z-index: 0` nó nằm trên mọi nội dung không định vị và phủ mờ lên
chính chữ của trang.

**Logo đổi vì lý do pháp lý, không phải thẩm mỹ.** Bản cũ là hình tròn đỏ + tam
giác trắng đặc, đặt cạnh chữ thì đọc gần như nhãn hiệu YouTube. Bản mới là khối bo
góc chuyển sắc với mũi tên ghép từ hai nét chéo. Icon app dùng chung hình đó.

Cần nói rõ để lần sau không ai nhầm: **đổi giao diện không giảm rủi ro về điều
khoản**. Chặn quảng cáo và dùng API nội bộ của YouTube vẫn là vi phạm bất kể app
trông thế nào — xem mục 8. Đổi logo chỉ xử lý được phần nhãn hiệu.

### 4.19e Trang chủ trộn theo người dùng (`POST /api/home`)

Feed chủ của YouTube khi không đăng nhập chỉ là một mớ đang thịnh hành — mở youpe
ra toàn thứ chẳng liên quan gì tới kênh mình theo. `buildHome()` trong
`recommend.ts` trộn ba nguồn theo trọng số:

| Trọng số | Nguồn | Lấy từ đâu |
|---|---|---|
| 3 | kênh đăng ký | video mới của tối đa 10 kênh, **chọn ngẫu nhiên** trong số đã đăng ký |
| 2 | bạn hay xem | tìm theo từ khoá lặp lại trong lịch sử (`queriesFromTitles`) |
| 1 | khám phá | feed chung, để không đóng khung trong cái đã biết |

Vài quyết định đáng nhớ:

- **POST chứ không GET.** Kênh đăng ký và lịch sử nằm ở `localStorage`; server
  không tự biết nên client phải gửi lên. Nhét cả danh sách kênh vào query string
  thì vừa dài vừa lọt vào log.
- **Lấy mẫu ngẫu nhiên 10 kênh**, không phải 10 kênh đầu. Lấy theo thứ tự thì ai
  đăng ký 50 kênh sẽ mãi mãi chỉ thấy 10 cái đầu bảng chữ cái.
- **Loại video đã xem** khỏi trang chủ — ngược với cột gợi ý cạnh trình phát, nơi
  xem lại là chuyện thường.
- Chưa theo dõi gì thì `buildHome` trả rỗng và route tự trả feed chung. Trang chủ
  của người mới không nên trống trơn.
- Nếu **chỉ** nguồn "khám phá" ra video thì cũng coi như chưa cá nhân hoá — không
  thì dòng "Trộn từ: khám phá" hiện lên trong khi chẳng trộn gì cả.
- Chỉ tab Trang chủ đi đường này. Vào tab "Âm nhạc" là muốn xem nhạc, không phải
  xem thứ mình hay xem.
- Cuộn thêm vẫn lấy từ `/api/feed` — nội dung theo sở thích hữu hạn, hết video mới
  của các kênh mình theo là hết.

### 4.19d Thứ tự lớp của sidebar — đừng cho nó đổi theo bề rộng

Xếp cứng, ba mức, không dùng breakpoint:

```
lớp phủ 30  <  sidebar 40  <  thanh trên 50
```

Bản cũ ghi `z-50 lg:z-30` cho sidebar trong khi lớp phủ là `z-40 xl:hidden`. Hai
mốc lệch nhau (1024 và 1280) tạo ra một **khoảng chết 1024–1280px**: sidebar tụt
xuống z-30 mà lớp phủ z-40 vẫn còn, nên lớp phủ đè lên chính cái menu. Hậu quả là
hai triệu chứng nghe như hai lỗi riêng biệt nhưng cùng một gốc — menu **không cuộn
được** (con lăn chạm vào lớp phủ), và menu **tối thui** (bị nhìn xuyên qua lớp đen
60%).

Cũng từng có **hai** lớp phủ: một ở `Sidebar.tsx` (`bg-black/50 lg:hidden`), một ở
`Shell.tsx` (`bg-black/60 xl:hidden`). Dưới 1024px chúng chồng nhau thành gần 80%
đen. Nay chỉ còn lớp ở `Shell.tsx` — nơi có sẵn hàm đóng menu.

Sidebar cũng bỏ `no-scrollbar`: giấu thanh cuộn đi thì không còn dấu hiệu nào cho
biết menu cuộn được.

### 4.20 `.env.local` không đi theo bản đóng gói

Cái bẫy im lặng nhất của cả dự án.

`.env.local` chỉ có tác dụng lúc chạy dev. Bản standalone của Next không mang nó
theo, và `prepare-web.mjs` cũng chỉ chép `.next/standalone` sang. Nên máy chạy dev
thì đồng bộ Turso ngon lành, cài bản đóng gói vào là lặng lẽ ghi xuống SQLite trên
máy — không lỗi, không cảnh báo, và phải tới lúc mở máy thứ hai mới phát hiện.

Vỏ desktop vì vậy đọc thêm một file riêng của từng máy (`userEnv()` trong
`main.js`):

```
Linux    ~/.config/youpe-desktop/data/youpe.env
Windows  %APPDATA%\youpe-desktop\data\youpe.env
macOS    ~/Library/Application Support/youpe-desktop/data/youpe.env
```

Không gói token vào file cài là cố ý: token Turso là quyền đọc ghi toàn bộ cơ sở
dữ liệu, gói vào thì ai cầm file cài cũng có nó. Đặt ở thư mục dữ liệu thì file
còn sống sót qua các lần cập nhật app.

`npm run check` ở thư mục gốc cảnh báo đúng trường hợp này.

---

## 5. Gỡ lỗi

### Kẹt ở 360p, không chọn được chất lượng → `npm run probe -- <videoId>`

Triệu chứng: badge của trình phát ghi `luồng gộp 360p`, menu chất lượng nói "Nguồn
này chỉ có một chất lượng". Nghĩa là `j.video` hoặc `j.audio` rỗng — YouTube chỉ
trả về đúng một file itag 18.

**Đừng đoán.** Danh sách client YouTube còn trả luồng adaptive thay đổi vài tháng
một lần. `scripts/probe-clients.mjs` hỏi thẳng từng client rồi in bảng:

```
client         video riêng  tiếng riêng  gộp   cao nhất  thời gian
tv             142          8            1     2160p     3.1s
ios            0            0            1     360p      2.4s
```

Client nào cột "video riêng" khác 0 thì đặt vào `.env.local`:

```
YTDLP_ARGS=--extractor-args youtube:player_client=tv
```

`ytdlp.ts` **không ghim client nữa** — để yt-dlp tự chọn. Muốn ghim thì đặt
`YTDLP_PLAYER_CLIENT`, khỏi sửa code.

Kết quả đo ngày 10/08/2026 (`dQw4w9WgXcQ`):

| client | video riêng | tiếng riêng | cao nhất |
|---|---|---|---|
| `default` | 22 | 4 | 2160p |
| `tv_embedded` | 22 | 4 | 2160p |
| `android_vr` | 22 | 4 | 2160p |
| `android` | 0 | 0 | **360p** |
| `ios`, `web`, `web_safari`, `mweb`, `tv` | lỗi "Requested format is not available" | | |

Không client nào sống thì vấn đề nằm ở IP hoặc đăng nhập, không phải ở code: thử
cookie trình duyệt (`YTDLP_COOKIES_FROM_BROWSER=chrome`, phải đóng hẳn trình duyệt
trước), yt-dlp bản nightly, hoặc đổi mạng.

**Bản phát hành ổn định của yt-dlp có thể đi sau YouTube.** Đã kiểm chứng
10/08/2026: `2026.07.04` là bản mới nhất trên GitHub, tải lại cũng không đổi gì —
nên "cập nhật yt-dlp" không phải lúc nào cũng là câu trả lời.

### Bước tiếp theo là `/api/debug/<videoId>`

Trả về:

- `ket_luan` — tóm tắt nguồn nào đang dùng được
- `ytdlp` — đã cài chưa, version, **thời gian khởi động vs thời gian chờ mạng**
- `innertube[]` — từng client, `sabr_only: true` nghĩa là đã bị chặn
- `fallback` — instance Piped/Invidious nào còn trả lời

### Log trong terminal

```
[yt-dlp <id>] 2431ms
[streams <id>] yt-dlp · 2456ms · 23 format
[db] đang dùng sqlite
```

Cách đọc:

- yt-dlp chiếm gần hết thời gian → nút thắt ở khâu trích xuất
- có `(cache)` mà vẫn lâu → nút thắt là băng thông qua proxy
- không in dòng nào khi bấm vào video → prefetch đã lo xong

### Nhớ đo ở bản production

`npm run dev` biên dịch lại từng route ở lần đầu truy cập. Đo tốc độ thật thì phải
`npm run build && npm start`.

---

## 6. Trạng thái hiện tại

### Đã chạy được

- Trang chủ 23 chủ đề, cuộn vô hạn
- Tìm kiếm, gợi ý gõ, trang kênh
- Trình phát: 3 chế độ (DASH / 2 luồng / luồng gộp), phím tắt kiểu YouTube,
  chọn chất lượng, tốc độ, phụ đề, rạp hát, màn hình kết thúc có đếm ngược
- Bình luận, lịch sử, xem sau, đã thích, kênh đăng ký (lưu ở máy)
- Tài khoản nội bộ: scrypt + cookie httpOnly
- **Kho dữ liệu chọn được: Turso (cloud) / SQLite / JSON** — xem 4.19
- Trang cài đặt: tìm kiếm cài đặt, khôi phục mặc định, gộp mục dữ liệu
- **Chủ đề màu**: 4 bộ dựng sẵn + tự tạo bộ riêng, chỉnh từng màu — xem 4.17
- Xem trước khi rê chuột lên thumbnail — xem 4.18
- Bảng phím tắt mở bằng `?`
- Cửa sổ nổi: tuỳ chọn giữ hay không giữ video mới trong cửa sổ nổi
- `npm run build` / `npm run check` ở thư mục gốc

### Chưa xong / chưa kiểm chứng

- **`youpe-desktop` chạy được ở chế độ dev trên Linux**, nhưng bản đóng gói
  (AppImage / .deb) chưa cài thử
- **`youpe-tv` chưa biên dịch thử** — không có Android SDK ở môi trường phát triển;
  nhiều khả năng có lỗi vặt ở API của `tv-material`, thư viện này hay đổi
- App TV chưa nối vào tài khoản và lịch sử (server đã có sẵn API)
- Chưa có: Shorts, playlist thật, tiếp tục xem từ chỗ dở, SponsorBlock

### Điểm yếu đã biết

- **Tốc độ phụ thuộc yt-dlp.** Video chưa cache có thể mất 5–13 giây. Hướng cắt tiếp
  theo: giữ một tiến trình Python thường trú thay vì spawn `.exe` mỗi lần
  (bản `.exe` là gói PyInstaller, riêng việc khởi động đã mất 1–4 giây trên Windows).
- **yt-dlp cũ là mất chất lượng.** Binary quá vài tuần thì YouTube ngừng trả luồng
  adaptive, chỉ còn itag 18 — biểu hiện ra ngoài là "video nào cũng 360p, không
  chọn được chất lượng". `prepare-web.mjs` nay tự tải bản mới trước khi đóng gói,
  nhưng **bản đã cài trên máy người dùng vẫn cứ già đi** — chưa có cơ chế tự cập nhật.
- **IP datacenter dễ bị chặn hơn IP nhà.** Lên VPS rất có thể gặp lại bức tường SABR.
- **Chế độ 2 luồng không có ABR**, mạng yếu là giật chứ không tự hạ chất lượng.
- **Ghi lên Turso chưa gộp theo lô.** Gói miễn phí cho 10 triệu dòng ghi/tháng —
  trần này chạm trước dung lượng rất xa. Ngày nào đưa tiến độ xem lên cloud thì
  phải gộp trước, ghi mỗi vài giây cho mỗi video là đủ đốt sạch.

---

## 7. Lệnh hay dùng

```bash
# ---- Ở THƯ MỤC GỐC (cách gọn nhất) ----
npm run dev            # web + Electron
npm run check          # kiểm tra mà không đóng gói
npm run build          # kiểm tra rồi đóng gói cho hệ đang chạy
npm run db:check       # thử kết nối Turso
npm run link:db        # chép cấu hình Turso sang chỗ bản đóng gói đọc được
npm run probe -- <id>  # dò client YouTube nào còn trả luồng adaptive
npm run icon           # sinh lại icon app từ youpe-desktop/build/icon.svg
npm run update:ytdlp

# ---- Web ----
cd youpe-web
npm install
npm run setup:ytdlp          # bắt buộc
npm run dev                  # hoặc: npx next dev -H 0.0.0.0 để TV box gọi được
npm run build && npm start   # đo tốc độ thật

# ---- Desktop ----
cd youpe-desktop
npm install
npm run dev                  # tự khởi động youpe-web nếu chưa chạy
npm run dist:linux           # hoặc dist:win / dist:mac

# ---- Android TV — mở bằng Android Studio ----
adb connect 192.168.1.20:5555
```

`npm run build` ở gốc kiểm tra Node, thư viện, kiểu dữ liệu, tuổi yt-dlp và cấu
hình Turso **trước khi** gọi electron-builder. Lý do: những thứ làm hỏng bản cài
đều không làm build thất bại — thiếu cấu hình Turso thì app vẫn chạy, chỉ ghi vào
chỗ khác; yt-dlp cũ thì vẫn phát video, chỉ kẹt 360p.

### Cấu hình Turso

Database của dự án này: **`youpe`**, tài khoản `phuclt093`, vùng `aws-ap-northeast-1`.

```
TURSO_DATABASE_URL=libsql://youpe-phuclt093.aws-ap-northeast-1.turso.io
```

URL thì cố định và không phải bí mật, nên ghi thẳng ở đây được. **Token thì không** —
nó là quyền đọc ghi toàn bộ database, mà file này nằm trong git và được đẩy lên
GitHub. Lấy token bằng một trong hai cách:

```bash
turso db tokens create youpe          # cấp token mới, cấp bao nhiêu lần cũng được
cat ~/.config/youpe-desktop/data/youpe.env    # hoặc đọc lại từ máy đã cấu hình rồi
```

Có hai giá trị rồi thì điền vào **hai chỗ** — thiếu chỗ thứ hai là bản đóng gói
không đồng bộ, xem mục 4.20:

| Chỗ | Dùng cho | Windows | Linux |
|---|---|---|---|
| `.env.local` | `npm run dev` | `youpe-web\.env.local` | `youpe-web/.env.local` |
| `youpe.env` | bản đã cài | `%APPDATA%\youpe-desktop\data\youpe.env` | `~/.config/youpe-desktop/data/youpe.env` |

Chỗ thứ hai **không phải chép tay, cũng không phải nhớ**: `npm run build` tự làm
khi thấy `.env.local` có Turso mà máy chưa có `youpe.env`. Muốn chạy riêng thì:

```bash
npm run link:db
```

Lệnh này chạy được trên cả ba hệ điều hành, tự ghi vào đúng thư mục của hệ đang
chạy.

Nó chỉ lấy hai khoá `TURSO_*` chứ không chép cả `.env.local`, vì file đó có thể
chứa đường dẫn cookie trình duyệt hay tuỳ chọn chỉ đúng với máy đang phát triển.
Đổi token thì sửa `.env.local` rồi chạy lại lệnh này.

Phần còn lại của mục này là cách làm tay, giữ lại phòng khi cần.

**Linux / macOS:**

```bash
cat >> youpe-web/.env.local <<'EOF'
TURSO_DATABASE_URL=libsql://youpe-phuclt093.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=ey...
EOF

mkdir -p ~/.config/youpe-desktop/data
grep '^TURSO_' youpe-web/.env.local > ~/.config/youpe-desktop/data/youpe.env
```

**Windows — Command Prompt** (cái mở ra khi gõ `cmd`, dấu nhắc dạng `E:\...>`).
Điền `.env.local` bằng tay theo mẫu ở trên, rồi:

```cmd
cd /d E:\Phuc\Projects\youpe
mkdir "%APPDATA%\youpe-desktop\data" 2>nul
findstr /b "TURSO_" youpe-web\.env.local > "%APPDATA%\youpe-desktop\data\youpe.env"
type "%APPDATA%\youpe-desktop\data\youpe.env"
```

**Windows — PowerShell** (dấu nhắc dạng `PS E:\...>`), chạy ở thư mục gốc kho.
Đừng dán khối này vào Command Prompt: `New-Item`, `Select-String` là lệnh của
PowerShell, cmd sẽ báo `is not recognized as an internal or external command`.

```powershell
@'
TURSO_DATABASE_URL=libsql://youpe-phuclt093.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=ey...
'@ | Set-Content -Encoding ASCII youpe-web\.env.local

$d = "$env:APPDATA\youpe\data"
New-Item -ItemType Directory -Force -Path $d | Out-Null
Select-String -Path youpe-web\.env.local -Pattern '^TURSO_' |
  ForEach-Object { $_.Line } | Set-Content -Encoding ASCII "$d\youpe.env"
```

Dùng `-Encoding ASCII` chứ đừng `UTF8`: PowerShell 5.1 ghi kèm BOM, và BOM đứng
trước `TURSO_DATABASE_URL` làm dòng đầu dễ bị đọc hụt.

Không cần đặt `DB_DRIVER`; hễ thấy `TURSO_DATABASE_URL` là tự chuyển. Bảng dựng tự
động lần chạy đầu. Xoá hai biến đi là quay về SQLite trên máy.

Kiểm chứng: `npm run check` (nói rõ thiếu chỗ nào), rồi `npm run db:check`, rồi
`turso db shell youpe "SELECT email FROM users"`.

---

## 8. Ranh giới cần giữ

- **Đây là dự án cá nhân**, dùng API nội bộ không chính thức của YouTube. Không nên
  triển khai công khai hay thương mại hoá.
- **Không đẩy `data/` lên git** — chứa mật khẩu đã băm và lịch sử người dùng.
- **Không đẩy `.env`** — có thể chứa đường dẫn cookie trình duyệt.
- Cả hai đã nằm trong `.gitignore` ở gốc.

---

## 9. Nhật ký tiến độ

Mới nhất ở trên cùng. Mỗi lần làm xong một đợt thì thêm một mục — ghi **đã làm gì,
vì sao, và còn nợ gì**. Chi tiết kỹ thuật thì viết vào mục 4 rồi trỏ tới, đừng
nhét hết vào đây.

### 10/08/2026 — Chủ đề màu, sửa xem trước, đưa dữ liệu lên Turso

**Cửa sổ nổi.** Thêm tuỳ chọn `keepPipOnVideoChange`: đang xem ở cửa sổ nổi mà đổi
video thì video mới có tự mở lại trong cửa sổ nổi hay không. Trước đây hành vi này
cứng, không tắt được.

**Trang Cài đặt dựng lại.** Gom các dòng vào một thẻ liền có đường kẻ ngăn thay vì
từng khối rời; bấm cả dòng là bật/tắt được; thêm ô tìm kiếm cài đặt (bỏ dấu được),
nút khôi phục mặc định, và gộp mục Dữ liệu kèm tổng dung lượng đang chiếm.

Một chi tiết đáng nhớ: công tắc dùng `div role="switch"` chứ **không** dùng
`button`, vì CSS chung có `button:active { transform: scale(.94) }` — để `button`
thì cả dòng dài co giật mỗi lần bấm.

**Hệ thống chủ đề màu** (mục 4.17). Toàn bộ bảng màu chuyển sang biến CSS. Bốn bộ
dựng sẵn: Mặc định, Cổ phong · Giấy cũ, Cổ phong · Mực đêm, Cổ phong · Hoa linh.
Người dùng nhân bản rồi chỉnh từng màu, lưu nhiều bộ. Đã dọn khoảng 25 chỗ màu
cứng (`bg-[#3f3f3f]`, `hover:bg-white/90`, `bg-white text-black`…) sang token, nếu
không thì chủ đề sáng có nút trắng trên nền kem.

**Xem trước khi rê chuột** (mục 4.18). Ba nguyên nhân chồng nhau, đã gỡ cả ba.

**Kho dữ liệu lên cloud** (mục 4.19, 4.20). Chốt Turso vì lược đồ SQLite dùng lại
nguyên vẹn. Việc tốn công nhất không phải viết driver mà là **chuyển lớp `Store`
sang bất đồng bộ** — làm theo cách backend được phép trả thẳng giá trị, nên
`db-sqlite.ts` và `db-json.ts` không phải sửa. Đã chạy thử toàn bộ SQL của driver
trên file SQLite local trước khi cắm token thật.

**Đóng gói.** `prepare-web.mjs` nay tải yt-dlp mới nhất trước khi gói và cảnh báo
nếu binary quá 30 ngày tuổi. Thêm `npm run build` / `npm run check` ở thư mục gốc
(`scripts/build.mjs`).

**Chế độ dev tự né cổng bận.** `scripts/dev.mjs` ghim cứng cổng 3000; lần chạy
trước chưa tắt hẳn là chết với một dòng `EADDRINUSE` sau khi bắt chờ 2 phút. Giờ
nó tự thử bind trước — hỏi `lsof` không đáng tin, tiến trình của user khác hoặc
máy bật `hidepid` là trả về rỗng trong khi cổng vẫn bị giữ — bận thì chuyển sang
cổng trống. Đặt `YOUPE_DEV_PORT` thì tôn trọng tuyệt đối, không tự đổi.

**Chế độ máy chủ đồng bộ** (mục 4.19b). Thêm `src/lib/api.ts` và
`src/middleware.ts`: điền địa chỉ server trong Cài đặt là tài khoản + thư viện đi
tới đó, bỏ trống là chạy như cũ. Nhờ vậy máy mới chỉ cần cài app rồi đăng nhập —
không phải dán token Turso lên từng máy nữa.

Chỗ cắt cố ý đặt ở **tầng client** chứ không phải thêm một driver `db-remote`.
Làm thành driver thì phải hiện `insertUser(email, passwordHash)` và
`libraryList(userId)` ra thành endpoint HTTP; ai gọi được là đọc được dữ liệu của
bất kỳ ai, muốn chặn lại phải nhúng một khoá chung vào app — tức là quay lại đúng
bài toán token, chỉ đổi tên. Đi từ client thì server nhận request đã biết "ai"
nhờ cookie phiên của chính người đó.

**Nút Đăng ký ở kết quả tìm kiếm**, gom thành `SubscribeButton` dùng chung. Logic
này trước đó bị chép ba lần và các bản không biết gì về nhau — đăng ký ở thẻ kênh
thì nút của chính kênh đó dưới danh sách video vẫn ghi "Đăng ký". Nút mới lắng
nghe `onSubsChange`.

**Mục Trò chơi** (`/games`): 2048, rắn săn mồi, dò mìn, lật hình. Tự viết, chạy
offline, điểm cao ở `localStorage` — cố ý không đưa lên Turso vì mỗi ván là một
lượt ghi. YouTube có Playables nhưng khoá vùng, không có Việt Nam, và không có
API công khai nào để mượn.

Mỗi trò ba mức khó, và **khó lên theo cách riêng của từng trò** chứ không chỉ đổi
tốc độ: 2048 thu nhỏ bàn (5×5 → 3×3, mức khó hạ mục tiêu xuống 512 vì 2048 trên
bàn 3×3 gần như bất khả thi); rắn đổi cỡ bàn, tốc độ, và mức Dễ cho đi xuyên
tường; dò mìn tăng **mật độ** mìn chứ không chỉ tăng cỡ bàn (12% → 17% → 18%),
vì cái khó nằm ở tỉ lệ mìn trên ô — bàn to mà giữ nguyên mật độ thì chỉ lâu hơn.
Nhãn mức khó ghi rõ thông số, không để trống "Dễ / Vừa / Khó".

Kỷ lục lưu riêng cho từng mức. Gộp chung thì kỷ lục đặt ở mức Dễ sẽ chắn mất kỷ
lục mức Khó vĩnh viễn.

**Ninja bóng đêm** là trò duy nhất vẽ bằng canvas + `requestAnimationFrame`, và
là trò duy nhất giữ trạng thái trong `useRef` chứ không phải state React — vòng
lặp chạy 60 khung/giây, đẩy hết vào state là dựng lại cây giao diện 60 lần mỗi
giây cho không. Chỉ điểm và chuỗi mới đồng bộ ra state, và chỉ khi con số đổi.

Ba con bug của trò này đáng ghi lại vì đều **không** hiện ra ở typecheck, chỉ lộ
khi mô phỏng vòng lặp bằng Node:

1. `side` là *địch đứng bên nào*, không phải *hướng nó đi*. Dùng thẳng làm hướng
   thì cả đám lùi ra khỏi màn hình — ván nào cũng bất tử. Hướng đi là `-side`.
2. Xác chết sống dậy. Bộ đếm `dying` đếm lùi **qua 0 xuống âm**, mà điều kiện bỏ
   qua là `dying > 0`, nên nó quay lại di chuyển và giết người chơi — trong khi
   nhánh vẽ đòi đúng `dying === 0` nên nó vô hình. Nay tách `alive` riêng khỏi
   `fade`.
3. Xuyên vùng chết. `Math.abs(x - ME) < DEADLY` hụt khi tốc độ đủ cao để một
   khung hình đi hơn 60px. Phải so sánh một chiều "đã qua vạch chưa".

Cách kiểm: chạy vòng lặp trong Node với ba kiểu người chơi — không làm gì (phải
0 điểm), bấm loạn (bị phạt chém hụt, ~3 điểm), và chơi đúng (~150 điểm). Chênh
lệch đó xác nhận luật chơi có thưởng cho kỹ năng.

Một cái bẫy đã sập trong lúc làm: trong 2048, `rotate` xoay **theo chiều kim đồng
hồ**, nên số lần xoay cho hướng "lên" là **3** chứ không phải 1. Bản đầu gán
`lên = 1` và hai phím dọc chạy ngược nhau. Nay có hằng số `LEFT/DOWN/RIGHT/UP`
kèm ghi chú ngay chỗ đó.

**Gộp tài liệu.** `docs/DB-CLOUD.md` và `docs/TURSO.md` bị xoá, nội dung dồn hết
vào file này. Trước đó ba file cùng nói về Turso, đọc lại không biết cái nào còn
đúng.

**Icon app.** Trước đây `youpe-desktop/build/` **không tồn tại**, mà
`package.json` lại trỏ `win.icon` và `linux.icon` vào đó — nên bản đóng gói dùng
icon Electron mặc định. Nay có `build/icon.svg` làm nguồn và `npm run icon` sinh
ra `build/icon.png`, `build/icon.ico`, `assets/icon.png`. Logo trong app và
favicon dùng chung một hình.

Hai cái bẫy ở đây: `.gitignore` có dòng `build/` (dành cho Gradle/Next) nuốt luôn
thư mục tài nguyên của electron-builder — đã thêm ngoại lệ; và icon lúc chạy phải
lấy từ `assets/` chứ không phải `build/`, vì `build/` không nằm trong danh sách
`files` của bản đóng gói.

**Vụ 360p — đã tìm ra và sửa.** Hai giả thuyết sai trước khi tới đúng, đáng ghi lại:

1. *"yt-dlp cũ"* — sai. Tải lại vẫn ra `2026.07.04`, đó đúng là bản mới nhất trên
   GitHub. **Bản phát hành ổn định có thể đi sau YouTube, cập nhật không cứu được.**
2. *"lỗi do mấy thay đổi hôm nay"* — sai. `git status` cho thấy toàn bộ đường trích
   xuất không bị đụng tới.

Nguyên nhân thật: `ytdlp.ts` ghim cứng `player_client=ios,android,web`, và ngày
10/08/2026 **cả ba đều chết** — `ios`/`web` báo "Requested format is not
available", `android` chỉ còn một luồng gộp 360p. Không có lỗi nào được ném ra nên
rất khó lần; app chỉ lặng lẽ rơi xuống luồng gộp.

Cách sửa: **bỏ ghim, để yt-dlp tự chọn.** Người bảo trì yt-dlp cập nhật danh sách
client nhanh hơn dự án này nhiều. Muốn ghim lại thì đặt `YTDLP_PLAYER_CLIENT`,
khỏi sửa code. Bảng đo ở mục 5.

Đáng nói: `scripts/ytdlp_worker.py` (đường Python) **không** ghim client nên vốn
đã đúng — chỉ đường chạy binary bị. Ai dùng `pip install yt-dlp` sẽ không bao giờ
gặp lỗi này.

Công cụ mới: `npm run probe -- <videoId>` hỏi thẳng 10 player client rồi in bảng.
Lần sau YouTube siết tiếp thì một lệnh là ra đáp án, khỏi đoán.

**Còn nợ sau đợt này:**

- Bản đã cài trên máy người dùng vẫn cứ già đi — chưa có cơ chế tự cập nhật yt-dlp
  theo lịch, cũng chưa có nút "Cập nhật yt-dlp" trong Cài đặt.
- `pruneSessions()` chưa được gọi theo lịch ở bản Turso.
- Chưa gộp ghi theo lô trước khi đưa tiến độ xem lên cloud.
- Chữ có chân của chủ đề cổ phong rơi về serif hệ thống trên Linux (chưa gói kèm
  font Noto Serif).
- Bản đóng gói Linux chưa cài thử.

### 16/09/2026 — Mọi luồng trên bản desktop Linux bị 403

Triệu chứng: player báo "YouTube từ chối luồng này (403)", bấm Thử lại vô ích.

Nguyên nhân thật: **worker Python dùng một bản `yt_dlp` rất cũ** có sẵn trong
`python3` của máy. `ytdlp-worker.ts` thấy `python3 -c "import yt_dlp"` chạy được là
ưu tiên worker hơn file exe 2026.08.19 gói kèm, không hề so phiên bản. Bản cũ vẫn
trả JSON "thành công" nhưng toàn URL client `MWEB`, không PO token, UA `Chrome/95`
⇒ googlevideo 403 hết. Bằng chứng nằm trong `stream-cache-v2.json`: tham số `c=MWEB`
ở mọi URL — exe 2026.08.19 chỉ dùng `visionos`/`web`, UA Chrome 145–151.

Ghi chú ở mục 10/08 ("ai dùng pip sẽ không gặp lỗi") chỉ đúng khi bản pip **mới**.

Đã sửa:
- `ytdlp_worker.py` báo `version` trong dòng `ready`; bỏ `player_skip` cho giống
  đường exe.
- `ytdlp-worker.ts` từ chối worker cũ hơn exe (hoặc không báo phiên bản);
  `YTDLP_WORKER=0` tắt hẳn worker. `workerState` cho biết vì sao bỏ qua.
- `sources.ts` đổi cache sang `stream-cache-v3.json`; `/api/streams/<id>?fresh=1`
  bỏ cache. Nút "Thử lại" gọi `fresh=1` trước khi tải lại — trước đây nó nhận lại
  đúng bộ URL chết trong 20 phút.
- `/api/debug/<id>` thêm `duong_trich_xuat`, `worker_bo_qua`, `clients` (tham số
  `c=`) và `thu_luong` (gọi thử googlevideo 2 byte đầu).

Lỗi phụ tìm thấy cùng lúc: Electron đặt userData theo `name` của package.json app
(`youpe-desktop`), còn `link:db` ghi vào `.../youpe/data` ⇒ **bản đóng gói chưa bao
giờ đọc được Turso**, lặng lẽ dùng `youpe.json`. Đã sửa `link-db.mjs` ghi vào
`youpe-desktop`, `main.js` đọc thêm chỗ cũ làm nền.
