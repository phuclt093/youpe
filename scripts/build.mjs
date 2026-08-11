/**
 * Một lệnh dựng cả app: kiểm tra trước, rồi đóng gói.
 *
 *   npm run build            đóng gói cho chính hệ điều hành đang chạy
 *   npm run build -- --check chỉ kiểm tra, không đóng gói
 *
 * Vì sao phải có bước kiểm tra chứ không gọi thẳng electron-builder: những thứ
 * làm hỏng bản cài đều **không** làm build thất bại. Thiếu cấu hình Turso thì app
 * vẫn chạy, chỉ là ghi vào SQLite trên máy. yt-dlp cũ thì vẫn phát được video,
 * chỉ là kẹt ở 360p. Build xanh lè mà bản cài hỏng là kiểu tệ nhất, nên thà nói
 * trước còn hơn.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkDb, readTurso, userEnvPath } from './link-db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'youpe-web');
const desktop = path.join(root, 'youpe-desktop');

const checkOnly = process.argv.includes('--check');
const warnings = [];

const c = {
  head: (s) => console.log(`\n\x1b[1;36m${s}\x1b[0m`),
  ok: (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`),
  warn: (s) => {
    warnings.push(s);
    console.log(`  \x1b[33m⚠\x1b[0m ${s}`);
  },
  die: (s) => {
    console.error(`\n\x1b[1;31m✗ ${s}\x1b[0m\n`);
    process.exit(1);
  },
};

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
const quiet = (cmd, cwd) => {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30_000 }).trim();
  } catch {
    return null;
  }
};

/* ---------------- 1. Node ---------------- */

c.head('[1/5] Node');

const major = Number(process.versions.node.split('.')[0]);
const minor = Number(process.versions.node.split('.')[1]);
if (major < 20) c.die(`Node ${process.versions.node} quá cũ. Cần Node 20 trở lên, khuyến nghị 22.`);

if (major < 22 || (major === 22 && minor < 5)) {
  // node:sqlite chỉ có từ 22.5; thấp hơn thì lớp lưu trữ tự rơi về file JSON
  c.warn(`Node ${process.versions.node} — không có node:sqlite, kho trên máy sẽ dùng file JSON.`);
} else {
  c.ok(`Node ${process.versions.node}`);
}

/* ---------------- 2. Thư viện ---------------- */

c.head('[2/5] Thư viện');

for (const [ten, dir] of [['youpe-web', web], ['youpe-desktop', desktop]]) {
  if (existsSync(path.join(dir, 'node_modules'))) {
    c.ok(`${ten}: đã có`);
  } else {
    console.log(`  → Đang cài cho ${ten}…`);
    run('npm install --no-audit --no-fund', dir);
    c.ok(`${ten}: cài xong`);
  }
}

/* ---------------- 3. Kiểu dữ liệu ---------------- */

c.head('[3/5] Kiểm tra kiểu');

/*
  `shell: true` là bắt buộc trên Windows.

  Ở đó `npx` thật ra là `npx.cmd`, mà từ Node 18.20/20.12 trở đi Node không cho
  spawn thẳng file `.cmd` nữa (vá lỗ hổng CVE-2024-27980). Không có cờ này thì
  spawnSync trả về `status: null` kèm `error: ENOENT`, còn `stdout`/`stderr` đều
  `undefined` — nên bước này in ra đúng chữ "undefined" rồi báo TypeScript hỏng,
  trong khi mã nguồn chẳng có lỗi kiểu nào. Bẫy này chỉ lộ ra trên Windows.
*/
const tsc = spawnSync('npx', ['tsc', '--noEmit'], {
  cwd: web,
  encoding: 'utf-8',
  shell: process.platform === 'win32',
});

if (tsc.error) {
  c.die(`Không chạy được tsc: ${tsc.error.message}`);
}
if (tsc.status !== 0) {
  console.error(tsc.stdout || tsc.stderr || '(tsc không in ra gì)');
  c.die('TypeScript báo lỗi. Sửa xong rồi build lại — đóng gói lúc này chỉ tốn thời gian.');
}
c.ok('không có lỗi kiểu');

/* ---------------- 4. yt-dlp ---------------- */

c.head('[4/5] yt-dlp');

const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const ytdlp = path.join(web, 'bin', exe);
const version = existsSync(ytdlp) ? quiet(`"${ytdlp}" --version`) : null;

if (!version) {
  c.warn('Chưa có bản nào — bước đóng gói sẽ tự tải về.');
} else {
  const d = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(version);
  const days = d ? Math.floor((Date.now() - Date.UTC(+d[1], +d[2] - 1, +d[3])) / 86_400_000) : 0;

  /*
    Bước prepare:web luôn tải bản mới nhất, nên đây chỉ là thông tin.

    Đừng đọc con số này thành "cần cập nhật": yt-dlp có lúc cả tháng không ra bản
    ổn định mới, và bản cũ vẫn có thể đang là bản mới nhất. Đã đo ngày 10/08/2026 —
    2026.07.04 lúc đó 37 ngày tuổi nhưng tải lại vẫn ra đúng nó. Video kẹt 360p thì
    dùng `npm run probe` chứ đừng đổ cho tuổi của binary.
  */
  if (days > 30) c.warn(`Bản ${version} đã ${days} ngày tuổi — có thể đây vẫn là bản mới nhất.`);
  else c.ok(`${version} (${days} ngày tuổi)`);
}

/* ---------------- 5. Cấu hình kho dữ liệu ---------------- */

c.head('[5/5] Kho dữ liệu');

const devTurso = !!readTurso(path.join(web, '.env.local')).TURSO_DATABASE_URL;
const runTurso = !!readTurso(userEnvPath()).TURSO_DATABASE_URL;

if (!devTurso && !runTurso) {
  c.ok('Chưa cấu hình Turso — dùng SQLite trên máy (bình thường nếu bạn muốn vậy)');
} else if (runTurso && !devTurso) {
  c.ok('Turso: bản đóng gói đã có cấu hình');
} else {
  /*
    Tự chép sang chỗ bản đóng gói đọc được, thay vì chỉ cảnh báo.

    Đây là cái bẫy im lặng nhất của cả dự án: `.env.local` chỉ dùng lúc chạy dev,
    bản standalone của Next không mang nó theo. Quên chép là bản cài vẫn chạy
    ngon lành nhưng ghi xuống kho trên máy — không lỗi, không cảnh báo, và phải
    tới lúc mở máy thứ hai mới phát hiện dữ liệu chẳng đi đâu cả.

    Cảnh báo suông thì vẫn quên. Cấu hình là của chính người dùng, ghi vào thư
    mục dữ liệu của chính họ, nên cứ làm luôn rồi báo lại.
  */
  const r = linkDb();
  if (r.ok) c.ok(`Turso: đã đồng bộ cấu hình sang ${r.dest}`);
  else c.warn(`Không chép được cấu hình Turso: ${r.reason}`);
}

/* ---------------- đóng gói ---------------- */

if (checkOnly) {
  console.log(`\n\x1b[1mChỉ kiểm tra, không đóng gói.\x1b[0m ${warnings.length} cảnh báo.\n`);
  process.exit(0);
}

const target = { linux: 'dist:linux', win32: 'dist:win', darwin: 'dist:mac' }[process.platform];
if (!target) c.die(`Chưa hỗ trợ đóng gói trên ${process.platform}.`);

c.head(`Đóng gói (${target})`);
console.log('  Lần đầu mất khoảng 5–15 phút.\n');

run(`npm run ${target}`, desktop);

/* ---------------- kết ---------------- */

console.log(`\n\x1b[1;32m✓ Xong.\x1b[0m File nằm trong youpe-desktop/release/\n`);

const list = quiet(
  process.platform === 'win32' ? 'dir /b release' : 'ls -1 release',
  desktop
);
if (list) {
  for (const f of list.split('\n')) {
    if (/\.(AppImage|deb|exe|dmg)$/i.test(f.trim())) console.log(`    ${f.trim()}`);
  }
  console.log();
}

if (warnings.length) {
  console.log('\x1b[33mNhắc lại các cảnh báo:\x1b[0m');
  for (const w of warnings) console.log(`  ⚠ ${w.split('\n')[0]}`);
  console.log();
}
