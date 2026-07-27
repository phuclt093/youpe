# youpe-desktop

Vỏ Electron cho `youpe-web`. Mục đích duy nhất: **bỏ hẳn bước mở terminal**.

App tự khởi động server Next ở nền, chọn một cổng còn trống, rồi mở cửa sổ trỏ vào đó.
Server vẫn là bản Next đầy đủ — yt-dlp, cache, tài khoản chạy y hệt bản web.

## Chạy thử khi đang phát triển

Một lệnh duy nhất:

```bash
cd youpe-desktop
npm install
npm run dev
```

Script `scripts/dev.mjs` kiểm tra cổng 3000 trước. Chưa có server thì nó tự chạy
`npm run dev` bên `youpe-web`, chờ tới khi sẵn sàng rồi mới mở cửa sổ. Đóng Electron
thì server cũng tắt theo — nếu chính nó khởi động.

Đã tự mở server ở terminal khác thì script nhận ra và dùng luôn, không chạy trùng.

Muốn chỉ mở vỏ Electron mà không đụng tới server: `npm run dev:shell-only`.

## Đóng gói thành file cài đặt

```bash
cd youpe-web && npm run setup:ytdlp   # để yt-dlp được gói kèm
cd ../youpe-desktop
npm install
npm run dist:win     # hoặc dist:mac / dist:linux
```

File cài đặt nằm ở `release/`. Bản Windows là trình cài đặt NSIS, cho phép chọn thư mục.

Máy người dùng **không cần cài Node** — Electron đã có sẵn Node bên trong, và
`ELECTRON_RUN_AS_NODE` cho phép chạy server bằng chính nó.

## Dữ liệu nằm ở đâu

Tài khoản và lịch sử lưu ngoài thư mục cài đặt để nâng cấp không mất:

| Hệ điều hành | Đường dẫn |
|---|---|
| Windows | `%APPDATA%\youpe\data` |
| macOS | `~/Library/Application Support/youpe/data` |
| Linux | `~/.config/youpe/data` |

Mở nhanh bằng menu **youpe → Mở thư mục dữ liệu**.

## Phím tắt

| Phím | Tác dụng |
|---|---|
| Ctrl+H | Về trang chủ |
| Ctrl+R | Tải lại |
| F11 | Toàn màn hình |
| F12 | Công cụ nhà phát triển |
| Ctrl + / Ctrl - | Phóng to / thu nhỏ |

Các phím tắt của trình phát giống bản web: Space phát/dừng, J L tua 10 giây, F toàn màn hình.

## Lưu ý

- Icon trong `build/` mới là bản tạm. Muốn đẹp thì thay `icon.ico` (Windows, 256×256)
  và `icon.icns` (macOS).
- Chưa ký số, nên Windows SmartScreen sẽ cảnh báo ở lần chạy đầu. Ký số cần chứng chỉ
  trả phí; dùng riêng thì bấm "More info → Run anyway" là được.
