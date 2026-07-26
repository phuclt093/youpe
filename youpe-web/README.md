# youpe — web app xem YouTube không quảng cáo

Next.js 15 + TypeScript + Tailwind. Giao diện dựng theo bố cục YouTube (dark theme),
dữ liệu lấy trực tiếp từ **InnerTube API** qua thư viện `youtubei.js` — cùng API mà
app Android `YMusic` trong repo này đang dùng, chỉ khác là bản JS chạy được trên server.

Không có quảng cáo vì luồng video được lấy thẳng từ `googlevideo.com` và phát bằng
trình phát riêng (shaka-player), không dùng iframe player của YouTube.

---

## Chạy thử

```bash
cd youpe-web
npm install
npm run setup:ytdlp       # tải yt-dlp về ./bin (bắt buộc, xem phần dưới)
cp .env.example .env      # sửa nếu cần
npm run dev               # http://localhost:3000
```

Build production:

```bash
npm run build && npm start
```

## Cấu trúc

```
src/
  app/
    page.tsx                  Trang chủ — grid video + chip filter
    watch/page.tsx            Trang xem — player, info, mô tả, related, comment
    results/page.tsx          Kết quả tìm kiếm (video + kênh)
    channel/[id]/page.tsx     Trang kênh — banner, avatar, tab Video/Shorts/Live
    history|later|liked|playlists/   Thư viện lưu ở localStorage
    api/
      feed/         GET ?tab=home|trending|music|gaming
      search/       GET ?q=&filter=all|video|channel|playlist
      suggest/      GET ?q=            autocomplete
      video/[id]/   metadata + related + captions
      comments/[id] GET ?sort=top|newest
      channel/[id]  GET ?tab=videos|shorts|live
      manifest/[id] sinh DASH (VOD) / HLS (live), URL đã trỏ về proxy
      related/[id]  gợi ý đã trộn nhiều nguồn
      streams/[id]  danh sách luồng thô: video-only / audio-only / muxed
      progressive/  luồng gộp sẵn, chốt chặn cuối
      debug/[id]    chẩn đoán: nguồn nào còn dùng được
      stream/       proxy tới googlevideo & instance, hỗ trợ Range header
      auth/         register | login | logout | me
      library/      lịch sử / xem sau / đã thích của tài khoản
  components/  Header, Sidebar, Shell, VideoCard, Player, Comments, LibraryPage,
               Chips, AuthMenu, AuthProvider, TopProgress, BackToTop, Icons
  lib/         innertube.ts (client + normalizer), ytdlp.ts, piped.ts, sources.ts,
               player.ts (dò client), dash.ts (sinh MPD), recommend.ts (trộn gợi ý),
               db.ts (kho JSON), auth.ts, prefetch.ts, topics.ts, format.ts,
               storage.ts, types.ts
```

## Vì sao cần proxy `/api/stream`

URL `googlevideo.com` **không trả CORS header** và bị khoá theo IP của bên yêu cầu.
Trình duyệt gọi thẳng sẽ bị chặn. Nên:

1. `/api/manifest/[id]` sinh manifest DASH và viết lại mọi URL segment thành
   `/api/stream?u=<url gốc>`.
2. `/api/stream` fetch phía server, forward `Range` (bắt buộc để tua được) và
   trả về kèm `Access-Control-Allow-Origin`.

Proxy chỉ cho phép host thuộc `googlevideo/youtube/ytimg/ggpht/google` — tránh bị
dùng làm open proxy.

## Player

`shaka-player` phát DASH, đủ để tách luồng video/audio riêng ⇒ xem được **1080p+**
(nếu dùng format muxed sẵn của YouTube thì trần chỉ 360p).

Phím tắt giống YouTube: `Space`/`K` phát-dừng, `J`/`L` ±10s, `←`/`→` ±5s,
`M` tắt tiếng, `F` toàn màn hình, `T` chế độ rạp hát, `C` phụ đề.

## Lấy stream ở đâu — và vì sao có nhiều tầng

YouTube đã chuyển sang **SABR** (server-side ABR): endpoint `/player` vẫn trả đầy đủ
metadata của các format nhưng **cắt sạch URL**, chỉ để lại `server_abr_streaming_url`
cần giao thức UMP riêng. Khi đó `youtubei.js` ném `No valid URL to decipher`.

Đọc `innertube/requests/Player.kt` của YMusic thì thấy nó cũng đụng tường tương tự và
xử lý bằng cách gọi một instance Piped để mượn URL. Nhưng các instance công cộng giờ
cũng gãy theo cùng nguyên nhân (502/500), còn Invidious phần lớn đã khoá API (401/403).

Nên `/api/streams/[id]` thử lần lượt 3 nguồn:

1. **yt-dlp** (`src/lib/ytdlp.ts`) — extractor được cập nhật liên tục, xử lý được PoToken
   và SABR. Đây là tầng đáng tin nhất hiện nay. Cần cài riêng, xem bên dưới.
2. **InnerTube** (`src/lib/player.ts`) — dò 7 client, lấy client đầu tiên còn trả URL.
3. **Piped / Invidious** (`src/lib/piped.ts`) — xoay vòng qua danh sách instance.

Còn phía trình phát cũng có nhiều tầng:

- **DASH + shaka-player** khi dựng được manifest (`/api/manifest/[id]`) — tốt nhất, có ABR.
- **2 luồng** — một thẻ `<video>` phát luồng video-only, một thẻ `<audio>` ẩn phát
  luồng audio-only, đồng bộ theo sự kiện và tự sửa lệch mỗi giây. Không cần
  `init/index range` nên vẫn xem được 1080p+ khi DASH không dựng nổi.
- **Luồng gộp (muxed)** — thường 360p/720p, phát thẳng bằng `<video>`. Chốt chặn cuối.

Góc trái khung hình hiện nhãn cho biết đang chạy ở tầng nào.

## Cài yt-dlp

Cách gọn nhất — tải thẳng file về `bin/`, không đụng tới PATH, không cần quyền admin:

```bash
npm run setup:ytdlp
```

Script tự chọn đúng bản cho hệ điều hành (`yt-dlp.exe` / `yt-dlp_macos` / `yt-dlp_linux`)
và lưu vào `bin/`. Code tự dò theo thứ tự: `YTDLP_PATH` → `./bin/` → PATH → vị trí winget
mặc định trên Windows. Cập nhật về sau chỉ cần chạy lại:

```bash
npm run update:ytdlp
```

Nếu đã cài sẵn bằng cách khác mà không tìm thấy, chạy `where.exe yt-dlp` (Windows) hoặc
`which yt-dlp` rồi đặt đường dẫn vào `.env`:

```
YTDLP_PATH=C:\đường\dẫn\yt-dlp.exe
```

Khi YouTube vẫn chặn, cách hiệu quả nhất là **mượn cookie từ trình duyệt**:

```
YTDLP_COOKIES_FROM_BROWSER=chrome
```

Đóng hẳn trình duyệt trước khi chạy, nếu không file cookie bị khoá. Nên dùng một tài
khoản phụ — cookie đăng nhập gửi kèm mọi request.

## Đưa lên server

`yt-dlp` chạy trên Linux bình thường, nên host được — nhưng **không dùng được nền tảng
serverless** (Vercel, Netlify, Cloudflare Workers): chúng không cho spawn tiến trình con
và giới hạn thời gian chạy quá ngắn. Cần một máy chủ thật hoặc container.

```bash
docker compose up -d --build
```

`Dockerfile` đã cài sẵn python3, ffmpeg và tải `yt-dlp` vào image, đặt luôn `YTDLP_PATH`.

Ba điều cần cân nhắc trước khi host công khai:

- **Băng thông** — mọi byte video đi qua `/api/stream`, tức máy chủ gánh toàn bộ lưu lượng.
  Một người xem 1080p ngốn khoảng 3–5 Mbps.
- **IP datacenter bị siết mạnh hơn IP nhà.** VPS thường bị chặn sớm hơn máy ở nhà. Nếu
  gặp, gắn `YTDLP_PROXY` trỏ qua proxy dân cư, hoặc gắn file cookie qua
  `YTDLP_COOKIES_FILE` (xem phần volumes bị chú thích trong `docker-compose.yml`).
- **Đây là dự án cá nhân**, dùng API nội bộ không chính thức. Mở công khai dễ dính rắc rối
  pháp lý lẫn kỹ thuật. Chạy nội bộ hoặc sau lớp đăng nhập thì hợp lý hơn.

## Tốc độ mở video

Thời gian chờ chủ yếu nằm ở việc gọi mạng sang YouTube và chi phí khởi động tiến trình
`yt-dlp`, không phải ở thư viện. Các cách đang dùng để rút ngắn:

- **Nạp trước** — rê chuột lên card video quá 400ms, hoặc vừa nhấn chuột, là trình duyệt
  gọi `/api/streams` ngay. Bấm vào thì server thường đã có sẵn kết quả.
  Giới hạn 2 lời gọi song song và mỗi video chỉ gọi một lần (`src/lib/prefetch.ts`).
- **Gộp lời gọi trùng** — trang xem và trình phát hỏi cùng lúc; `resolveStreams` gom chung
  một promise nên `yt-dlp` chỉ chạy một lần.
- **Cache 20 phút** theo videoId. URL của googlevideo sống khoảng 6 tiếng nên vẫn an toàn.
- **Nhớ nguồn thắng** và bỏ qua InnerTube trong 10 phút sau khi thấy nó bị SABR-gate.
- **Cờ cho yt-dlp**: `--extractor-args youtube:player_skip=webpage,configs` bớt 2 request
  mỗi video, cộng `--ignore-config`, `--socket-timeout 10`.
- **shaka-player nạp động**, chỉ tải khi thật sự cần DASH.

Viết lại các thư viện này không giúp gì: nút thắt là mạng và tiến trình con, còn tự làm
extractor đồng nghĩa với việc phải tự xử lý SABR và PoToken.

### Chất lượng khởi đầu

Ở chế độ 2 luồng **không có ABR** — không có cơ chế tự hạ chất lượng khi mạng yếu như
DASH. Nên nếu chọn ngay bản cao nhất (nhiều video có 1440p/2160p) thì trình duyệt phải
nạp rất nhiều dữ liệu mới phát được. Mặc định giới hạn **720p**, đổi bằng menu chất
lượng và lựa chọn được nhớ trong `localStorage`.

Audio cũng chọn quanh 128kbps thay vì bản cao nhất (`AUDIO_TARGET_BPS` trong `.env`).

### Đo xem chậm ở đâu

Terminal chạy `npm run dev` in ra hai dòng cho mỗi video:

```
[yt-dlp <id>] 2431ms
[streams <id>] yt-dlp · 2456ms · 23 format
```

Nhãn ở góc trái khung hình cũng hiện thời gian đó. Đọc như sau:

- **yt-dlp chiếm gần hết** → nút thắt là bước trích xuất. Thử bỏ
  `YTDLP_COOKIES_FROM_BROWSER` nếu đang bật (đọc cookie từ trình duyệt khá chậm).
- **`(cache)` mà vẫn lâu** → nút thắt là băng thông qua `/api/stream`, không phải trích xuất.
- **Không có dòng nào khi bấm vào video** → prefetch đã lo xong từ trước, phần chờ còn lại
  là tải dữ liệu video.

### Nhớ đo ở bản production

`npm run dev` biên dịch lại từng route khi lần đầu truy cập và không tối ưu gì cả.
Muốn biết tốc độ thật:

```bash
npm run build
npm start
```

Chênh lệch thường rất lớn, nhất là ở lần mở trang đầu tiên.

Hướng cắt tiếp theo nếu vẫn chậm: giữ sẵn một tiến trình yt-dlp thường trú thay vì spawn
mới mỗi lần.

## Xử lý sự cố

**Xem nguồn nào còn sống:** mở `http://localhost:3000/api/debug/<videoId>`.
Trường `ket_luan` tóm tắt; `ytdlp` cho biết đã cài chưa và lấy được bao nhiêu format;
`innertube[]` liệt kê từng client (`sabr_only: true` là đã bị chặn); `fallback` cho biết
instance nào trả lời.

**Instance Piped đều lỗi** — thêm instance khác vào `.env`:

```
PIPED_INSTANCES=https://pipedapi.kavin.rocks,https://pipedapi.adminforge.de
INVIDIOUS_INSTANCES=https://inv.nadeko.net,https://yewtu.be
```

Danh sách đang sống: <https://piped-instances.kavin.rocks/> và <https://api.invidious.io/>.

**Tiếng lệch hình ở chế độ 2 luồng** — chỉnh `MAX_DRIFT` trong `src/components/Player.tsx`
(mặc định 0.3 giây). Giảm xuống thì bám sát hơn nhưng hay giật.

**Feed trang chủ rỗng** — `/api/feed` đã có chuỗi fallback
(`getHomeFeed` → `FEwhat_to_watch` → `FEtrending` → search).

**IP server bị chặn** — VPS/datacenter IP bị SABR-gate sớm hơn IP nhà. Chạy local hoặc
đặt `HTTP_PROXY` / `YTDLP_PROXY` trỏ qua residential proxy.

## Chủ đề

`src/lib/topics.ts` là nguồn duy nhất khai báo chủ đề — hàng chip ở trang chủ, mục
Khám phá ở sidebar và route `/api/feed` đều đọc từ đây, nên thêm chủ đề mới chỉ cần
thêm một dòng.

Mỗi chủ đề thuộc một trong ba kiểu:

- `home` — feed đề xuất, có chuỗi dự phòng riêng
- `browse` — gọi thẳng endpoint browse của YouTube (vd `FEtrending`), dữ liệu sát nhất
- `search` — tìm theo cụm từ, dùng cho chủ đề YouTube không có feed riêng

Feed hỗ trợ cuộn vô hạn. `youtubei.js` giấu token phân trang bên trong đối tượng feed
nên không truyền qua HTTP được; server giữ đối tượng đó trong 10 phút để còn gọi
`getContinuation()`.

## Gợi ý video

Cách ngây thơ là tìm kiếm theo tiêu đề video đang xem — nhưng làm vậy thì cả cột phải
dồn về cùng một kênh. `src/lib/recommend.ts` trộn bốn nguồn có bản chất khác nhau:

| Nguồn | Trọng số | Lấy từ đâu |
|---|---|---|
| Gợi ý của YouTube | 3 | `watch_next_feed` |
| Chủ đề | 2 | tìm theo `keywords` của video, chọn ngẫu nhiên 3 |
| Bạn hay xem | 2 | từ khoá lặp lại trong lịch sử xem gần đây |
| Xu hướng | 1 | `FEtrending` |

Rồi xen kẽ luân phiên theo trọng số, vừa đi vừa **chặn trần 2 video mỗi kênh**. Đây mới
là thứ thật sự phá thế độc chiếm của một kênh — không có nó thì dù trộn bao nhiêu nguồn,
kênh nào nhiều video vẫn tràn hết danh sách.

Phần "bạn hay xem" lấy tiêu đề 12 video gần nhất trong lịch sử, tách từ, bỏ từ nối
tiếng Việt lẫn tiếng Anh, và **chỉ giữ từ xuất hiện ở ít nhất 2 video** — một video lẻ
không đủ để kết luận đó là sở thích.

Chủ đề được chọn ngẫu nhiên trong danh sách keywords nên mở lại cùng một video sẽ ra
gợi ý hơi khác nhau, đỡ nhàm.

Gợi ý nằm ở route riêng `/api/related/[id]` chứ không nhét chung vào `/api/video`, để
trang xem hiện ngay còn cột gợi ý nạp sau. Kết quả tìm kiếm cache 10 phút, xu hướng 30 phút.
Cột phải hiện tên các nguồn đã góp mặt, tiện kiểm chứng.

## Tài khoản

Tài khoản nội bộ của youpe, không liên quan gì tới tài khoản Google. Mục đích là để
lịch sử và các danh sách theo được sang thiết bị khác.

- Mật khẩu băm bằng `scrypt` kèm salt riêng cho từng người, so sánh bằng `timingSafeEqual`.
- Phiên đăng nhập là token ngẫu nhiên 32 byte, lưu trong cookie `httpOnly` + `sameSite=lax`,
  hạn 30 ngày. Cookie bật `secure` khi chạy production.
- Dữ liệu nằm ở `data/youpe.json` — kho JSON tự viết trong `src/lib/db.ts`, ghi qua file
  tạm rồi `rename` nên mất điện giữa chừng không hỏng dữ liệu cũ.

Không dùng SQLite vì `better-sqlite3` phải biên dịch native, hay vỡ khi đổi phiên bản Node
và làm image Docker phình to. Ở quy mô vài người dùng thì file JSON là đủ; cần lớn hơn thì
thay riêng `src/lib/db.ts`, phần còn lại không phải sửa.

**Chưa đăng nhập** thì mọi thứ vẫn chạy như cũ bằng `localStorage`. **Đăng nhập lần đầu**
sẽ đẩy dữ liệu đang có ở máy lên server rồi kéo về, nên không mất gì. Sau đó `localStorage`
đóng vai bộ nhớ đệm để giao diện phản hồi tức thì, còn server là nguồn thật.

Nhớ sao lưu `data/` — mất file là mất tài khoản.

## Còn thiếu / hướng phát triển tiếp

- Đăng nhập tài khoản Google (OAuth device flow của `youtubei.js`) để lấy đúng
  feed đề xuất và danh sách đăng ký thật
- Đặt lại mật khẩu qua email, và giới hạn số lần đăng nhập sai
- Infinite scroll (continuation token) cho feed & kết quả tìm kiếm
- Trang Shorts dạng vuốt dọc
- Tự host một instance Piped để fallback không phụ thuộc instance công cộng
- Thumbnail preview khi rê chuột trên thanh tua (storyboard)
- SponsorBlock để bỏ đoạn tài trợ trong video
- PWA + offline download

## Lưu ý

Dự án cá nhân, dùng API nội bộ không chính thức của YouTube — không phải API công khai
và có thể vi phạm Điều khoản dịch vụ của YouTube. Đừng triển khai công khai hay
thương mại hoá. Toàn bộ nội dung video thuộc về YouTube và các chủ sở hữu bản quyền.
