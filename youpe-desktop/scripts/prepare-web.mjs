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

const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const src = path.join(web, 'bin', exe);

/**
 * Tải bản yt-dlp mới nhất ngay trước khi đóng gói.
 *
 * Trước đây bước này chỉ chép cái đang có trong `youpe-web/bin`, mà cái đó là do
 * ai đó chạy `npm run setup:ytdlp` từ đời nào không rõ. YouTube đổi cách phát
 * video liên tục, nên một bản yt-dlp cũ vài tuần thường mất sạch luồng adaptive
 * và chỉ còn đúng itag 18 — biểu hiện ra ngoài là "video nào cũng 360p, không
 * chọn được chất lượng". Xuất xưởng bản cài với binary cũ sẵn là tự chuốc lấy
 * lỗi đó cho mọi người dùng.
 *
 * Không tải được (offline, GitHub chặn) thì dùng bản đang có chứ không dừng —
 * chỉ nói rõ là đang gói bản cũ.
 */
function refreshYtdlp() {
  if (process.env.YOUPE_SKIP_YTDLP === '1') {
    console.log('→ Bỏ qua cập nhật yt-dlp (YOUPE_SKIP_YTDLP=1)');
    return;
  }

  console.log('→ Cập nhật yt-dlp về bản mới nhất…');
  try {
    execSync('npm run setup:ytdlp', { cwd: web, stdio: 'inherit' });
  } catch {
    console.warn(
      existsSync(src)
        ? '   ⚠ Tải không được — vẫn gói bản yt-dlp đang có trong youpe-web/bin.'
        : '   ⚠ Tải không được và cũng chưa có sẵn bản nào.'
    );
  }
}

/** Hỏi thẳng binary xem nó là bản nào, để dòng log còn kiểm chứng được */
function ytdlpVersion(file) {
  try {
    return execSync(`"${file}" --version`, { encoding: 'utf-8', timeout: 30_000 }).trim();
  } catch {
    return null;
  }
}

refreshYtdlp();

console.log('→ Gom yt-dlp…');
mkdirSync(outBin, { recursive: true });

if (existsSync(src)) {
  cpSync(src, path.join(outBin, exe));
  const v = ytdlpVersion(src);
  console.log(`   đã gom ${exe}${v ? ` (bản ${v})` : ''}`);

  // Bản phát hành của yt-dlp đánh số theo ngày, nên tuổi của nó đọc thẳng ra được
  const d = v && /^(\d{4})\.(\d{2})\.(\d{2})/.exec(v);
  if (d) {
    const days = Math.floor((Date.now() - Date.UTC(+d[1], +d[2] - 1, +d[3])) / 86_400_000);
    if (days > 30) {
      console.warn(
        `   ⚠ Bản này đã ${days} ngày tuổi. YouTube đổi nhanh hơn thế — nhiều khả năng\n` +
          '     người dùng sẽ chỉ xem được 360p. Kiểm tra lại mạng rồi chạy lại lệnh này.'
      );
    }
  }
} else {
  console.warn(
    `   ⚠ Không thấy ${src}. Chạy "npm run setup:ytdlp" trong youpe-web trước,\n` +
      '     nếu không app đóng gói sẽ phải dựa vào yt-dlp có sẵn trong PATH của máy người dùng.'
  );
}

console.log('✓ Xong. Chạy "npm run dist" để đóng gói.');
