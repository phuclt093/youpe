/**
 * Sinh icon app từ `build/icon.svg`.
 *
 *   npm run icon
 *
 * Sinh ra:
 *   build/icon.png    1024×1024 — electron-builder dùng cho Linux, và tự suy ra
 *                     .icns cho macOS
 *   build/icon.ico    nhiều kích thước — cho Windows
 *   assets/icon.png   512×512 — gán cho cửa sổ lúc chạy, để taskbar có icon ngay
 *                     cả khi chạy dev (chưa qua electron-builder)
 *
 * Vì sao có cả hai chỗ: `build/` chỉ dành cho electron-builder và **không** nằm
 * trong danh sách `files` của bản đóng gói, nên lúc chạy không đọc được. `assets/`
 * thì có. Đặt nhầm chỗ là icon biến mất đúng lúc cần nhất.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.resolve(root, '..', 'youpe-web');

/*
  sharp không phải phụ thuộc của youpe-desktop — nó đi kèm Next ở youpe-web. Mượn
  từ đó thay vì cài thêm một bản 30 MB nữa chỉ để chạy vài giây mỗi khi đổi icon.
*/
let sharp;
try {
  sharp = createRequire(path.join(web, 'package.json'))('sharp');
} catch {
  console.error('✗ Không thấy sharp. Chạy "npm install" trong youpe-web trước.');
  process.exit(1);
}

const svg = readFileSync(path.join(root, 'build', 'icon.svg'));
const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

mkdirSync(path.join(root, 'build'), { recursive: true });
mkdirSync(path.join(root, 'assets'), { recursive: true });

writeFileSync(path.join(root, 'build', 'icon.png'), await png(1024));
console.log('✓ build/icon.png (1024×1024)');

writeFileSync(path.join(root, 'assets', 'icon.png'), await png(512));
console.log('✓ assets/icon.png (512×512)');

/**
 * Gói nhiều PNG thành một file .ico.
 *
 * Tự viết thay vì kéo thêm thư viện: định dạng ICO chỉ là một cái mục lục 6 byte,
 * mỗi ảnh một mục 16 byte, rồi dán thẳng dữ liệu PNG vào sau. Windows từ Vista
 * trở đi đọc được PNG nhúng trong ICO, không cần chuyển sang BMP.
 */
async function makeIco(sizes) {
  const images = await Promise.all(sizes.map(png));

  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); // dành riêng, luôn 0
  head.writeUInt16LE(1, 2); // 1 = icon (2 là con trỏ chuột)
  head.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;

  for (let i = 0; i < images.length; i++) {
    const e = Buffer.alloc(16);
    // 256 được ghi là 0 — trường này chỉ có một byte
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 0);
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 1);
    e.writeUInt8(0, 2); // số màu trong bảng màu, 0 = không dùng bảng màu
    e.writeUInt8(0, 3); // dành riêng
    e.writeUInt16LE(1, 4); // số mặt phẳng màu
    e.writeUInt16LE(32, 6); // số bit mỗi điểm ảnh
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += images[i].length;
  }

  return Buffer.concat([head, ...entries, ...images]);
}

writeFileSync(path.join(root, 'build', 'icon.ico'), await makeIco([16, 32, 48, 64, 128, 256]));
console.log('✓ build/icon.ico (16→256)');

console.log('\nXong. Đóng gói lại để icon có hiệu lực: npm run build (ở thư mục gốc)');
