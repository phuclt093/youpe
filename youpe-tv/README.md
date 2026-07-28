# youpe cho Android — TV box và điện thoại

Một project Gradle, ba module:

| Module | Là gì | Cài lên đâu |
|---|---|---|
| `:core` | Phần lõi dùng chung — gọi API, mô hình dữ liệu, trình phát Media3, tải offline | không cài riêng |
| `:app` | Giao diện Android TV, điều khiển bằng remote | TV box, Android TV |
| `:mobile` | Giao diện điện thoại, chạm và vuốt | điện thoại, máy tính bảng |

Hai giao diện tách riêng vì remote và ngón tay không dùng chung được một bố cục.
Nhưng phần khó thì giống hệt nhau, nên nó nằm ở `:core` — sửa một lỗi là cả hai
bản cùng được sửa.

## Trước khi chạy

Cả hai app **không tự trích xuất video**. Chúng chỉ đọc JSON từ server `youpe-web`
chạy trên máy tính trong nhà. Nên phải bật server trước:

```
cd youpe-web
npm run dev
```

Rồi xem địa chỉ LAN của máy tính (Windows: `ipconfig`, thường dạng `192.168.1.x`)
và nhập vào màn hình đầu tiên của app, kèm cổng — ví dụ `192.168.1.10:3000`.

Điện thoại và máy tính phải cùng một mạng wifi.

## Build

```
# bản TV
gradlew :app:assembleRelease

# bản điện thoại
gradlew :mobile:assembleRelease
```

File APK nằm ở `app/build/outputs/apk/release/` và `mobile/build/outputs/apk/release/`.

Cài bằng cách chép sang thiết bị rồi mở, hoặc:

```
adb install -r mobile/build/outputs/apk/release/mobile-release.apk
```

TV box thường không có trình duyệt file tiện dụng — cách gọn nhất là dùng `adb connect`
qua mạng LAN sau khi bật gỡ lỗi USB trong phần Tuỳ chọn nhà phát triển.

## Bản điện thoại có gì

- **Phát nền**: tắt màn hình vẫn nghe tiếp, điều khiển ở thanh thông báo và màn hình khoá
- **Cửa sổ nổi**: bấm nút Home khi đang xem thì video thu thành cửa sổ nhỏ
- **Shorts**: vuốt dọc như bản web
- **Tải về xem offline**: tải xong xem được cả khi server tắt
- **Đăng nhập**: đồng bộ lịch sử, xem sau, đã thích với bản web và TV

## Vì sao trình phát nằm trong một Service

Nếu `ExoPlayer` sống trong Activity thì xoay máy hay tắt màn hình là Android được
phép giết Activity, và video dừng theo. Đặt trong `PlaybackService` kiểu
`mediaPlayback` thì hệ thống giữ lại, đồng thời tự dựng khung điều khiển ở thanh
thông báo — không phải tự vẽ. `MediaSession` đi kèm cũng khiến tai nghe bluetooth
điều khiển được, hoàn toàn miễn phí.

Đây cũng chính là vấn đề mà bản web phải giải bằng thủ thuật di chuyển thẻ DOM.
Trên Android có sẵn cách làm đúng.

## Chưa kiểm chứng

Toàn bộ mã Android **chưa từng được biên dịch** — môi trường soạn thảo không có
Android SDK. Lần build đầu gần như chắc chắn sẽ có lỗi vặt về import hoặc chữ ký
API. Đây là khung có cấu trúc đầy đủ, không phải bản đã chạy được.
