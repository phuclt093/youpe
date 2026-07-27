# youpe — tài liệu bàn giao

Đọc file này trước khi làm gì. Nó ghi lại **vì sao** mọi thứ ở trạng thái hiện tại,
đặc biệt là những hướng đã thử và thất bại — để không mất công đi lại đường cũ.

Cập nhật lần cuối: 27/07/2026

---

## 1. Mục tiêu

Xem YouTube không quảng cáo, giao diện bám sát YouTube. Ba đầu ra:

| Thư mục | Là gì | Trạng thái |
|---|---|---|
| `youpe-web/` | Next.js 15 — vừa là giao diện web, vừa là server API cho mọi client | Chạy được |
| `youpe-desktop/` | Vỏ Electron, tự khởi động server, không cần terminal | Chưa build thử |
| `youpe-tv/` | App Android TV (Kotlin, Compose TV, Media3) | Chưa biên dịch thử |

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

## 5. Gỡ lỗi

### Bước đầu tiên luôn là `/api/debug/<videoId>`

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
- Tài khoản nội bộ: scrypt + cookie httpOnly, SQLite
- Trang cài đặt, bảng phím tắt mở bằng `?`

### Chưa xong / chưa kiểm chứng

- **`youpe-desktop` chưa build thử lần nào** — code viết cẩn thận nhưng chưa chạy
- **`youpe-tv` chưa biên dịch thử** — không có Android SDK ở môi trường phát triển;
  nhiều khả năng có lỗi vặt ở API của `tv-material`, thư viện này hay đổi
- App TV chưa nối vào tài khoản và lịch sử (server đã có sẵn API)
- Chưa có: Shorts, playlist thật, tiếp tục xem từ chỗ dở, SponsorBlock

### Điểm yếu đã biết

- **Tốc độ phụ thuộc yt-dlp.** Video chưa cache có thể mất 5–13 giây. Hướng cắt tiếp
  theo: giữ một tiến trình Python thường trú thay vì spawn `.exe` mỗi lần
  (bản `.exe` là gói PyInstaller, riêng việc khởi động đã mất 1–4 giây trên Windows).
- **IP datacenter dễ bị chặn hơn IP nhà.** Lên VPS rất có thể gặp lại bức tường SABR.
- **Chế độ 2 luồng không có ABR**, mạng yếu là giật chứ không tự hạ chất lượng.

---

## 7. Lệnh hay dùng

```bash
# Windows — cách dễ nhất
# bấm đúp youpe-web\create-shortcut.bat, rồi bấm đúp shortcut "youpe" trên Desktop

# Web
cd youpe-web
npm install
npm run setup:ytdlp          # bắt buộc
npm run dev                  # hoặc: npx next dev -H 0.0.0.0 để TV box gọi được
npm run build && npm start   # đo tốc độ thật

# Desktop
cd youpe-desktop
npm install
npm run dev                  # cần youpe-web đang chạy ở cổng 3000
npm run dist:win             # đóng gói

# Android TV — mở bằng Android Studio
adb connect 192.168.1.20:5555
```

---

## 8. Ranh giới cần giữ

- **Đây là dự án cá nhân**, dùng API nội bộ không chính thức của YouTube. Không nên
  triển khai công khai hay thương mại hoá.
- **Không đẩy `data/` lên git** — chứa mật khẩu đã băm và lịch sử người dùng.
- **Không đẩy `.env`** — có thể chứa đường dẫn cookie trình duyệt.
- Cả hai đã nằm trong `.gitignore` ở gốc.
