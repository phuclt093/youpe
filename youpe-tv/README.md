# youpe-tv — ứng dụng Android TV

Client cho server `youpe-web`. **Toàn bộ phần khó nằm ở server** — trích xuất bằng
yt-dlp, trộn gợi ý, cache. App TV chỉ đọc JSON rồi phát, nên nó nhẹ và không phải
chạy yt-dlp trên box.

## Vì sao native chứ không bọc WebView

`MergingMediaSource` của Media3 ghép luồng hình và luồng tiếng ngay trong ExoPlayer.
Bản web phải đồng bộ thủ công hai thẻ `<video>` và `<audio>` rồi tự sửa lệch mỗi giây,
vì trình duyệt không có sẵn khả năng này — cách đó chạy tạm được trên máy tính nhưng
rất dễ giật trên phần cứng yếu của TV box.

## Build

Cần Android Studio (bản Ladybug trở lên) và JDK 17.

1. Mở thư mục `youpe-tv` bằng Android Studio, chờ Gradle sync.
2. Cắm TV box qua ADB hoặc bật ADB qua mạng:
   ```bash
   adb connect 192.168.1.20:5555
   ```
3. Bấm Run, hoặc build APK:
   ```bash
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

Chưa có Gradle wrapper trong repo — Android Studio sẽ tự sinh khi mở lần đầu.
Muốn tạo tay: `gradle wrapper --gradle-version 8.9`.

## Cấu hình lần đầu

Mở app, nhập địa chỉ server dạng `http://192.168.1.10:3000`.

Xem IP của máy chạy server: `ipconfig` (Windows) hoặc `ip addr` (Linux).

Ba lỗi hay gặp khi không kết nối được:

1. Server đang chạy ở chế độ chỉ nghe localhost. Chạy lại bằng
   `npx next dev -H 0.0.0.0` hoặc `npx next start -H 0.0.0.0`.
2. Tường lửa Windows chặn cổng 3000. Mở cổng cho Node, hoặc chạy trong PowerShell
   quyền quản trị:
   ```powershell
   New-NetFirewallRule -DisplayName "youpe" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```
3. TV box và máy chủ khác mạng Wi-Fi — nhất là khi router phát cả băng tần khách.

## Điều khiển

| Phím | Tác dụng |
|---|---|
| Mũi tên | Di chuyển giữa các thẻ video |
| OK | Chọn, hoặc phát/dừng khi đang xem |
| Trái / Phải khi đang xem | Tua 10 giây |
| Back | Quay lại, ở trang chủ thì thoát |

## Nếu video giật hoặc mất tiếng

Vào Cài đặt, bật **Chỉ dùng H.264**. Nhiều TV box đời rẻ chỉ có bộ giải mã phần cứng
cho H.264; gặp VP9 hay AV1 thì phải giải mã bằng CPU nên không kịp, gặp Opus thì mất
tiếng hẳn. Bật tuỳ chọn này thì server chỉ trả về H.264 kèm AAC.

Vẫn giật thì hạ **Chất lượng tối đa** xuống 720p.

## Còn thiếu

- Lịch sử và tài khoản (server đã có API `/api/auth` và `/api/library`, chưa nối vào app)
- Video đề xuất ở màn hình kết thúc
- Tiếp tục xem từ chỗ đang dở
- Phụ đề
- Tự tìm server trong mạng LAN bằng mDNS, đỡ phải gõ IP
