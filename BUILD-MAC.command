#!/usr/bin/env bash
#
# Build youpe cho macOS.
#
# Đuôi `.command` để bấm đúp trong Finder là chạy được, không cần mở Terminal.
# Lần đầu phải cấp quyền chạy:
#
#   chmod +x BUILD-MAC.command
#
# Phải build TRÊN MÁY MAC. Không build chéo từ Linux hay Windows được — cùng lý
# do như bản Linux, xem docs/LINUX.md: yt-dlp gói kèm phải đúng nền tảng.
#
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$PWD"

echo
echo "  ============================================"
echo "    youpe  -  Build cho macOS"
echo "  ============================================"
echo
echo "  Lan dau mat khoang 5-15 phut tuy toc do mang."
echo

# Homebrew cai Node ra hai chỗ khác nhau tuỳ máy Intel hay Apple Silicon
for p in /opt/homebrew/bin /usr/local/bin; do
  [ -d "$p" ] && export PATH="$p:$PATH"
done
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  \. "$NVM_DIR/nvm.sh" 2>/dev/null || true
fi

if ! command -v node >/dev/null 2>&1; then
  printf '\n\033[1;31m[X] Chua cai Node.js.\033[0m\n\n'
  echo "     brew install node"
  echo "     hoac tai tai https://nodejs.org (chon LTS)"
  echo
  read -r -p "Bam Enter de dong..."
  exit 1
fi

npm run build

OUT="$ROOT/youpe-desktop/release"
echo
echo "  File nam trong: $OUT"
[ -d "$OUT" ] && open "$OUT"
echo
echo "  Ban .dmg chua ky so, nen lan dau mo macOS se chan."
echo "  Chuot phai vao app -> Open -> Open, hoac:"
echo "    xattr -dr com.apple.quarantine /Applications/youpe.app"
echo
read -r -p "Bam Enter de dong..."
