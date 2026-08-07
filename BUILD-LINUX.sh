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
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$PWD"

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[X] %s\033[0m\n\n' "$*" >&2; exit 1; }

echo
echo "  ============================================"
echo "    youpe  -  Build cho Linux Mint / Ubuntu"
echo "  ============================================"
echo
echo "  Se lam lan luot:"
echo "    1. Kiem tra Node"
echo "    2. Cai thu vien cho youpe-web"
echo "    3. Tai yt-dlp ban Linux"
echo "    4. Cai thu vien cho youpe-desktop"
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
  NVM_NODE="$(ls -d $HOME/.nvm/versions/node/v*/bin 2>/dev/null | tail -n 1 || true)"
  if [ -n "$NVM_NODE" ]; then
    export PATH="$NVM_NODE:$PATH"
  fi
fi

# ---------- 1. Node ----------
command -v node >/dev/null 2>&1 || die \
"Chua cai Node.js.

     Mint / Ubuntu:  sudo apt install nodejs npm
     Ban moi hon:    https://nodejs.org (chon LTS)"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
say "Node: $(node -v)"

# node:sqlite chi co tu Node 22.5 tro len; thap hon thi server tu quay ve ban JSON
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "  [!] Node cu hon 22 — tai khoan se luu bang file JSON thay vi SQLite."
  echo "      Van chay duoc, chi cham hon khi du lieu nhieu."
fi

# ---------- 2. thu vien cho web ----------
say "[1/4] Thu vien cho youpe-web…"
cd "$ROOT/youpe-web"
if [ -d node_modules ]; then
  echo "      da co, bo qua"
else
  npm install --no-audit --no-fund
fi

# ---------- 3. yt-dlp ----------
say "[2/4] yt-dlp (ban Linux)…"
if [ -x bin/yt-dlp ]; then
  echo "      da co, bo qua"
else
  npm run setup:ytdlp
fi

# ---------- 4. thu vien cho desktop ----------
say "[3/4] Thu vien cho youpe-desktop…"
cd "$ROOT/youpe-desktop"
if [ -d node_modules ]; then
  echo "      da co, bo qua"
else
  npm install --no-audit --no-fund
fi

# ---------- 5. dong goi ----------
say "[4/4] Build ban web va dong goi…"
npm run dist:linux

OUT="$ROOT/youpe-desktop/release"

echo
echo "  ============================================"
echo "    XONG"
echo "  ============================================"
echo
echo "  File nam trong:  $OUT"
echo
ls -1 "$OUT" 2>/dev/null | grep -Ei '\.(AppImage|deb)$' | sed 's/^/    /' || true
echo
echo "  Cai bang .deb (khuyen nghi — co trong menu ung dung):"
echo "    sudo apt install $OUT/youpe_*_amd64.deb"
echo
echo "  Hoac chay thang AppImage, khong can cai:"
echo "    chmod +x $OUT/youpe-*.AppImage"
echo "    $OUT/youpe-*.AppImage"
echo
echo "  Neu AppImage bao loi ve sandbox (hay gap tren Ubuntu 24.04 tro len):"
echo "    doc phan xu ly trong docs/LINUX.md"
echo
