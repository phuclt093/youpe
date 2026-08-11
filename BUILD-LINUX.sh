#!/usr/bin/env bash
#
# Build youpe cho Linux Mint / Ubuntu.
#
# Chạy file này TRÊN MÁY LINUX, không phải trên Windows. Xem docs/LINUX.md
# để hiểu vì sao không build chéo được.
#
#   chmod +x BUILD-LINUX.sh
#   ./BUILD-LINUX.sh
#
# File này chỉ là vỏ bọc quanh `npm run build`, thêm phần tự nạp NVM và mở
# thư mục kết quả. Quen tay rồi thì gõ thẳng `npm run build` cũng vậy.
#
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$PWD"

die() { printf '\n\033[1;31m[X] %s\033[0m\n\n' "$*" >&2; exit 1; }

echo
echo "  ============================================"
echo "    youpe  -  Build cho Linux Mint / Ubuntu"
echo "  ============================================"
echo
echo "  Se lam lan luot:"
echo "    1. Kiem tra Node va thu vien"
echo "    2. Kiem tra loi kieu TypeScript"
echo "    3. Tai yt-dlp ban moi nhat"
echo "    4. Dong bo cau hinh Turso sang cho ban dong goi doc duoc"
echo "    5. Build ban web roi dong goi thanh AppImage va .deb"
echo
echo "  Lan dau mat khoang 5-15 phut tuy toc do mang."
echo

# Tự động nạp NVM / Node nếu NVM được cài đặt trong máy
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  \. "$NVM_DIR/nvm.sh" 2>/dev/null || true
fi
if ! command -v node >/dev/null 2>&1; then
  NVM_NODE="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | tail -n 1 || true)"
  [ -n "$NVM_NODE" ] && export PATH="$NVM_NODE:$PATH"
fi

command -v node >/dev/null 2>&1 || die \
"Chua cai Node.js.

     Mint / Ubuntu:  sudo apt install nodejs npm
     Ban moi hon:    https://nodejs.org (chon LTS)"

npm run build

OUT="$ROOT/youpe-desktop/release"

echo
echo "  Cai bang .deb (khuyen nghi - co trong menu ung dung):"
echo "    sudo apt install $OUT/youpe_*_amd64.deb"
echo
echo "  Hoac chay thang AppImage, khong can cai:"
echo "    chmod +x $OUT/youpe-*.AppImage"
echo "    $OUT/youpe-*.AppImage"
echo
echo "  Neu AppImage bao loi ve sandbox (hay gap tren Ubuntu 24.04 tro len):"
echo "    doc phan xu ly trong docs/LINUX.md"
echo
