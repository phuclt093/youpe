# Build app Android — TV box và điện thoại

Máy bạn đã có Android SDK sẵn ở `C:\Users\Windows\AppData\Local\Android\Sdk`, và
project đã có `gradlew` nên **không cần cài Gradle**. Gần như xong rồi.

---

## Cách nhanh nhất: bấm đúp file .bat

Ở thư mục gốc của project:

| File | Ra cái gì |
|---|---|
| `BUILD-TV.bat` | APK cho Android TV box |
| `BUILD-MOBILE.bat` | APK cho điện thoại |

Script tự tìm Java và Android SDK, tự tạo `local.properties` nếu thiếu, build xong
thì mở luôn thư mục chứa file APK.

Lần đầu Gradle phải tải thư viện nên mất 5–15 phút. Những lần sau vài chục giây.

---

## Chạy từ VS Code

Chép `docs/vscode-tasks.json` thành `.vscode/tasks.json` ở thư mục gốc project.
Sau đó `Ctrl+Shift+P` → **Tasks: Run Task** → chọn việc cần chạy.

Có sẵn: build TV, build điện thoại, cài thẳng lên thiết bị, dọn bản build, xem log,
và chạy server web.

Nên cài thêm hai tiện ích cho VS Code:

- **Kotlin Language Server** (`fwcd.kotlin`) — gợi ý mã và báo lỗi khi gõ
- **Gradle for Java** (`vscjava.vscode-gradle`) — hiện danh sách task ở thanh bên

Nói thẳng: **VS Code không phải chỗ tốt nhất để làm Android.** Không có trình xem
bố cục, không có trình gỡ lỗi tử tế, gợi ý mã Compose thì yếu. Máy bạn đã có SDK
nghĩa là nhiều khả năng đã cài Android Studio — mở thư mục `youpe-tv` bằng Studio
sẽ đỡ vất vả hơn hẳn, và nó miễn phí. Nhưng nếu bạn quen VS Code thì cách trên vẫn
chạy được đầy đủ.

---

## Cài lên TV box

TV box thường không có cổng USB tiện để cắm dây, nên cài qua mạng LAN là gọn nhất.

**Trên TV box, bật gỡ lỗi:**

1. Cài đặt → Giới thiệu → bấm liên tục vào **Bản dựng** khoảng 7 lần
2. Quay lại Cài đặt → **Tuỳ chọn nhà phát triển** → bật **Gỡ lỗi USB**
   (một số box có thêm mục **Gỡ lỗi qua mạng**, bật luôn)
3. Cài đặt → Mạng → ghi lại địa chỉ IP, dạng `192.168.1.xxx`

**Trên máy tính:**

```
adb connect 192.168.1.xxx:5555
adb install -r youpe-tv\app\build\outputs\apk\release\app-release.apk
```

Lần đầu kết nối, trên màn hình TV sẽ hiện hộp thoại xin phép — chọn **Cho phép**.

Nếu `adb` báo không tìm thấy lệnh, thêm đường dẫn này vào PATH của Windows:

```
C:\Users\Windows\AppData\Local\Android\Sdk\platform-tools
```

**Cách khác, không cần adb:** chép file APK vào USB, cắm vào TV box, mở bằng trình
quản lý file của box. Nhiều box chặn cài từ nguồn lạ, phải bật **Nguồn không xác định**
trong Cài đặt bảo mật trước.

---

## Cài lên điện thoại

Chép file APK sang máy bằng cách nào cũng được (Zalo, USB, Google Drive), mở file đó
rồi cho phép cài từ nguồn không xác định.

Hoặc cắm cáp USB, bật Gỡ lỗi USB trong Tuỳ chọn nhà phát triển, rồi:

```
adb install -r youpe-tv\mobile\build\outputs\apk\release\mobile-release.apk
```

---

## Sau khi cài xong

Cả hai app **không tự trích xuất video** — chúng chỉ đọc JSON từ server `youpe-web`
chạy trên máy tính. Nên trước khi mở app, bật server:

```
cd youpe-web
npm run dev
```

Xem địa chỉ LAN của máy tính bằng lệnh `ipconfig` (dòng **IPv4 Address**), rồi nhập
vào màn hình đầu tiên của app kèm cổng, ví dụ `192.168.1.10:3000`.

TV box, điện thoại và máy tính phải cùng một mạng wifi.

Nếu app báo không kết nối được dù địa chỉ đúng, gần như luôn là do **tường lửa
Windows** chặn cổng 3000 từ máy khác. Mở Windows Defender Firewall → Advanced →
Inbound Rules → thêm luật cho phép cổng 3000.

---

## Lỗi hay gặp khi build

| Thông báo | Nguyên nhân | Cách sửa |
|---|---|---|
| `SDK location not found` | thiếu `youpe-tv\local.properties` | chạy `BUILD-TV.bat`, nó tự tạo |
| `Unsupported class file major version` | Java quá cũ | cần JDK 17+; Android Studio có sẵn ở `jbr` |
| `Could not resolve ...` | mạng chặn repo của Google | thử mạng khác hoặc bật VPN |
| `Installation failed ... INSTALL_FAILED_UPDATE_INCOMPATIBLE` | đã cài bản ký khác | `adb uninstall com.youpe.tv` rồi cài lại |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | APK không hợp kiến trúc box | hiếm, báo lại để build riêng cho ARM |

**Lưu ý quan trọng:** mã Android trong project này **chưa từng được biên dịch lần
nào** — máy soạn thảo không có Android SDK. Lần build đầu nhiều khả năng còn lỗi vặt
về import hoặc chữ ký API Compose. Cứ chép nguyên đoạn lỗi Gradle in ra và gửi lại.
