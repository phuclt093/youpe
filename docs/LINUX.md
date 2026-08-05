# youpe trên Linux Mint và Ubuntu

App desktop là Electron nên chạy được cả ba hệ điều hành. Phần hạ tầng đã sẵn sàng
từ trước — script tải yt-dlp và script gom file đều tự nhận nền tảng — nên bản Linux
chủ yếu là cấu hình đóng gói.

---

## Điều quan trọng nhất: build **trên máy Linux**

Không build được từ Windows sang Linux. Cụ thể:

- **`.deb`** cần `dpkg-deb` và `fakeroot`, là công cụ của Linux
- **AppImage** cần công cụ `appimagetool` chạy trên Linux
- Quan trọng hơn cả: **`yt-dlp` gói kèm phải là bản Linux**. Build trên Windows sẽ
  gom nhầm `yt-dlp.exe`, cài lên Linux là mọi video đều không phát được

Nếu chỉ có máy Windows, dùng WSL2 (`wsl --install -d Ubuntu`) rồi chạy script bên
trong đó. WSL là Linux thật nên đóng gói bình thường.

---

## Cách làm

Chép cả thư mục project sang máy Linux, rồi:

```bash
chmod +x BUILD-LINUX.sh
./BUILD-LINUX.sh
```

Script tự kiểm tra Node, cài thư viện, tải `yt-dlp` bản Linux, build bản web và
đóng gói. Lần đầu mất 5–15 phút.

Kết quả nằm trong `youpe-desktop/release/`:

| File | Dùng khi nào |
|---|---|
| `youpe_0.1.0_amd64.deb` | Cài vào hệ thống, có biểu tượng trong menu ứng dụng |
| `youpe-0.1.0-x86_64.AppImage` | Chạy ngay không cần cài, tiện để thử hoặc chép sang máy khác |

---

## Cài đặt

**Bằng .deb** (khuyến nghị cho Mint và Ubuntu):

```bash
sudo apt install ./youpe_0.1.0_amd64.deb
```

Dùng `apt install` chứ không phải `dpkg -i`, vì `apt` tự cài luôn các thư viện phụ
thuộc. Cài xong tìm "youpe" trong menu ứng dụng.

Gỡ ra: `sudo apt remove youpe`

**Bằng AppImage:**

```bash
chmod +x youpe-0.1.0-x86_64.AppImage
./youpe-0.1.0-x86_64.AppImage
```

---

## Lỗi sandbox trên Ubuntu 24.04 trở lên

Nếu AppImage báo lỗi kiểu:

```
The SUID sandbox helper binary was found, but is not configured correctly.
```

hoặc

```
FATAL: failed to enable sandbox
```

Ubuntu 24.04 siết quyền tạo user namespace của tiến trình không đặc quyền, mà
Chromium bên trong Electron cần quyền đó cho lớp cách ly của nó. Ba cách, xếp theo
mức độ nên dùng:

**1. Dùng bản .deb thay vì AppImage** — bản .deb cài `chrome-sandbox` với quyền
đúng ngay lúc cài, nên không dính lỗi này. Đây là cách sạch nhất.

**2. Cho riêng AppImage này được tạo namespace:**

```bash
sudo tee /etc/apparmor.d/youpe > /dev/null <<'EOF'
abi <abi/4.0>,
include <tunables/global>
profile youpe /path/toi/youpe-*.AppImage flags=(unconfined) {
  userns,
  include if exists <local/youpe>
}
EOF
sudo systemctl reload apparmor
```

Sửa `/path/toi/` thành đường dẫn thật. Cách này chỉ nới cho đúng một file.

**3. Chạy với `--no-sandbox`:**

```bash
./youpe-0.1.0-x86_64.AppImage --no-sandbox
```

Nhanh nhất nhưng **tắt lớp cách ly của trình duyệt**. App này chỉ mở nội dung từ
server của chính bạn nên rủi ro thấp, nhưng vẫn là hạ mức an toàn — chỉ nên dùng
khi hai cách trên không được.

---

## Sau khi cài

App tự khởi động server ở nền bằng Node có sẵn trong Electron, nên **máy không cần
cài Node** để chạy app đã đóng gói. Chỉ lúc build mới cần.

Dữ liệu người dùng nằm ở:

```
~/.config/youpe/data/
```

Xoá thư mục đó là app trở về như mới cài.

---

## Chạy ở chế độ dev trên Linux

```bash
cd youpe-web && npm install && npm run setup:ytdlp
npm run dev
```

Rồi mở `http://localhost:3000`. Hoặc chạy vỏ desktop, nó tự khởi động server:

```bash
cd youpe-desktop && npm install && npm run dev
```

---

## Cho máy khác trong nhà xem cùng

Cần cho TV box hoặc điện thoại vào được thì server phải lắng nghe trên mọi địa chỉ
chứ không riêng localhost:

```bash
cd youpe-web
npm run dev -- --hostname 0.0.0.0
```

Xem địa chỉ LAN bằng `ip addr show` hoặc `hostname -I`, rồi nhập vào app TV/điện
thoại kèm cổng, ví dụ `192.168.1.10:3000`.

Ubuntu bật sẵn tường lửa `ufw` thì mở cổng:

```bash
sudo ufw allow 3000/tcp
```

---

## Những chỗ chỉ có trên Windows

Bản Linux thiếu vài thứ, đều là do hệ điều hành chứ không phải lỗi:

| Tính năng | Trên Linux |
|---|---|
| Menu chuột phải ở icon taskbar | Không có — API Jump List là của Windows |
| Nút điều khiển khi rê chuột lên icon | Không có — cũng là API riêng của Windows |
| Thanh tiến trình trên icon | **Có**, nếu môi trường desktop hỗ trợ (Unity, KDE, GNOME có tiện ích mở rộng) |
| Phím media toàn cục | **Có** |
| Cửa sổ nổi | **Có** |

Code đã kiểm tra nền tảng trước khi gọi các API đó, nên chạy trên Linux không văng,
chỉ là các phần Windows lặng lẽ không làm gì.

---

## Chưa kiểm chứng

Cấu hình đóng gói Linux **chưa từng chạy thử** — máy soạn thảo không dựng được
Electron. Lần build đầu có thể còn vướng ở khâu đóng gói. Cứ gửi lại đoạn lỗi.
