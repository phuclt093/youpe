"""
Tiến trình yt-dlp thường trú.

Vì sao cần: bản yt-dlp.exe trên Windows là gói PyInstaller — mỗi lần chạy phải
giải nén vào thư mục tạm rồi nạp Python từ đầu, tốn 1-4 giây trước khi làm bất cứ
việc gì. Với mỗi video là một lần gọi, khoản đó cộng dồn rất nhanh.

Worker này nạp yt_dlp đúng một lần rồi nằm chờ, đọc yêu cầu từ stdin và ghi kết
quả ra stdout, mỗi dòng một JSON. Nhờ vậy chỉ còn tốn thời gian gọi mạng.

Giao thức:
  vào:  {"rid": 1, "id": "abc123", "allClients": false}
  ra:   {"rid": 1, "ok": true, "data": {...}}
        {"rid": 1, "ok": false, "error": "..."}
"""

import json
import sys

try:
    from yt_dlp import YoutubeDL
except ImportError:
    print(json.dumps({"ready": False, "error": "chua cai yt_dlp"}), flush=True)
    sys.exit(1)


def base_opts():
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "check_formats": False,
        "geo_bypass": True,
        "socket_timeout": int(sys.argv[1]) if len(sys.argv) > 1 else 5,
        "retries": 1,
        "extractor_retries": 1,
        # bỏ qua trang xem và file config của player: bớt 2 request mỗi video
        "extractor_args": {"youtube": {"player_skip": ["webpage", "configs"]}},
    }

    cookies_browser = sys.argv[2] if len(sys.argv) > 2 else ""
    if cookies_browser:
        opts["cookiesfrombrowser"] = (cookies_browser,)

    cookie_file = sys.argv[3] if len(sys.argv) > 3 else ""
    if cookie_file:
        opts["cookiefile"] = cookie_file

    return opts


# Hai instance: một bộ mặc định, một bộ quét mọi player client cho lượt thử lại
ydl_fast = YoutubeDL(base_opts())

opts_all = base_opts()
opts_all["extractor_args"] = {"youtube": {"player_client": ["all"]}}
ydl_all = YoutubeDL(opts_all)

print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue

    try:
        req = json.loads(line)
    except Exception:
        continue

    rid = req.get("rid")
    video_id = req.get("id", "")
    ydl = ydl_all if req.get("allClients") else ydl_fast

    try:
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}", download=False
        )
        data = ydl.sanitize_info(info)
        sys.stdout.write(json.dumps({"rid": rid, "ok": True, "data": data}) + "\n")
    except Exception as e:
        sys.stdout.write(
            json.dumps({"rid": rid, "ok": False, "error": str(e)}) + "\n"
        )

    sys.stdout.flush()
