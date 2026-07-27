/**
 * Build youpe-web rồi gom bản standalone vào resources/ để electron-builder đóng gói.
 *
 * Next sinh ra bản "standalone" gồm server.js kèm đúng những module thật sự cần,
 * nhưng nó KHÔNG tự copy .next/static và public — phải copy tay, thiếu là trang
 * hiện ra không có CSS.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const web = path.resolve(root, '..', 'youpe-web');
const outServer = path.join(root, 'resources', 'server');
const outBin = path.join(root, 'resources', 'bin');

if (!existsSync(web)) {
  console.error(`Không thấy youpe-web ở ${web}`);
  process.exit(1);
}

console.log('→ Build youpe-web…');
execSync('npm run build', { cwd: web, stdio: 'inherit' });

const standalone = path.join(web, '.next', 'standalone');
if (!existsSync(standalone)) {
  console.error(
    'Không thấy .next/standalone. Kiểm tra next.config.mjs đã có output: "standalone" chưa.'
  );
  process.exit(1);
}

console.log('→ Gom file vào resources/server…');
rmSync(outServer, { recursive: true, force: true });
mkdirSync(outServer, { recursive: true });
cpSync(standalone, outServer, { recursive: true });

// hai thư mục Next không tự copy
cpSync(path.join(web, '.next', 'static'), path.join(outServer, '.next', 'static'), {
  recursive: true,
});
if (existsSync(path.join(web, 'public'))) {
  cpSync(path.join(web, 'public'), path.join(outServer, 'public'), { recursive: true });
}

console.log('→ Gom yt-dlp…');
mkdirSync(outBin, { recursive: true });
const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const src = path.join(web, 'bin', exe);

if (existsSync(src)) {
  cpSync(src, path.join(outBin, exe));
  console.log(`   đã gom ${exe}`);
} else {
  console.warn(
    `   ⚠ Không thấy ${src}. Chạy "npm run setup:ytdlp" trong youpe-web trước,\n` +
      '     nếu không app đóng gói sẽ phải dựa vào yt-dlp có sẵn trong PATH của máy người dùng.'
  );
}

console.log('✓ Xong. Chạy "npm run dist" để đóng gói.');
