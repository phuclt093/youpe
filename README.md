# youpe

Xem YouTube không quảng cáo, giao diện bám sát YouTube.

| Thư mục | Là gì |
|---|---|
| `youpe-web/` | Next.js — giao diện web, đồng thời là server API cho mọi client |
| `youpe-desktop/` | Vỏ Electron, tự khởi động server, không cần terminal |
| `youpe-tv/` | App Android TV (Kotlin + Compose TV + Media3) |
| `docs/CONTEXT.md` | **Đọc file này trước** — kiến trúc, quyết định, những hướng đã thất bại |
| `docs/TURSO.md` | Hướng dẫn chuyển dữ liệu tài khoản lên Turso |

## Bắt đầu nhanh

**Windows:** bấm đúp `create-shortcut.bat`, rồi bấm đúp shortcut **youpe** vừa hiện trên Desktop.
Lần đầu nó tự cài thư viện, tải yt-dlp, build và mở trình duyệt.

| File | Việc |
|---|---|
| `create-shortcut.bat` | Tạo shortcut — chạy một lần duy nhất |
| `BUILD-DESKTOP.bat` | Đóng gói thành file cài đặt Windows |
| `BUILD-WEB.bat` | Build lại bản web sau khi sửa code |

Xem `HUONG-DAN.txt` nếu gặp trục trặc.

**Dòng lệnh:**

```bash
cd youpe-web
npm install
npm run setup:ytdlp    # bắt buộc — tải yt-dlp về ./bin
npm run dev            # http://localhost:3000
```

Không chạy được thì mở `http://localhost:3000/api/debug/<videoId>` — nó nói rõ nguồn nào
còn dùng được và hỏng ở đâu.

## Kiến trúc một dòng

Mọi client gọi cùng một API. Server lo phần khó (yt-dlp, cache, gợi ý); client chỉ đọc
JSON rồi phát. Thêm client mới không phải viết lại gì.

Chi tiết ở [`docs/CONTEXT.md`](docs/CONTEXT.md).

## Lưu ý

Dự án cá nhân, dùng API nội bộ không chính thức của YouTube. Không nên triển khai công
khai hay thương mại hoá. Nội dung video thuộc về YouTube và các chủ sở hữu bản quyền.
