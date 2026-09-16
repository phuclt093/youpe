/**
 * Chép cấu hình Turso từ `youpe-web/.env.local` sang chỗ bản đóng gói đọc được.
 *
 *   npm run link:db
 *
 * Chạy trên máy nào thì ghi đúng chỗ của hệ điều hành đó:
 *
 *   Linux    ~/.config/youpe-desktop/data/youpe.env
 *   Windows  %APPDATA%\youpe-desktop\data\youpe.env
 *   macOS    ~/Library/Application Support/youpe-desktop/data/youpe.env
 *
 * Vì sao là `youpe-desktop` chứ không phải `youpe`: Electron đặt tên thư mục
 * userData theo `productName` trong package.json **của app**, không phải theo
 * `build.productName` của electron-builder. package.json của youpe-desktop chỉ có
 * `name: "youpe-desktop"` ⇒ app đọc `.../youpe-desktop/data`. Trước 16/09/2026 lệnh
 * này ghi vào `.../youpe/data`, bản đóng gói không bao giờ thấy ⇒ lặng lẽ dùng
 * youpe.json trên máy thay vì Turso.
 *
 * Vì sao phải chép thay vì để bản đóng gói đọc thẳng `.env.local`: xem
 * docs/CONTEXT.md mục 4.20. Tóm tắt — bản standalone của Next không mang theo
 * file đó, và nhét token vào file cài thì ai cầm file cài cũng có nó.
 *
 * Chỉ chép hai khoá TURSO_*, không chép cả file. `.env.local` có thể chứa đường
 * dẫn cookie trình duyệt hay tuỳ chọn chỉ đúng với máy đang phát triển; mang
 * nguyên sang môi trường chạy thật là rước lỗi khó hiểu.
 *
 * File này vừa chạy trực tiếp được, vừa cho `build.mjs` gọi lại — bước đóng gói
 * tự làm việc này, vì quên nó là bản cài lặng lẽ không đồng bộ.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Phải trùng với `name` trong youpe-desktop/package.json — đó là tên Electron dùng */
const APP_DIR = 'youpe-desktop';

/** Thư mục dữ liệu của app trên hệ điều hành đang chạy */
export function userDataDir() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA || home, APP_DIR, 'data');
  if (process.platform === 'darwin')
    return path.join(home, 'Library', 'Application Support', APP_DIR, 'data');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_DIR, 'data');
}

export const userEnvPath = () => path.join(userDataDir(), 'youpe.env');

const KEYS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];

/** Đọc các khoá TURSO_* trong một file kiểu KEY=VALUE */
export function readTurso(file) {
  if (!existsSync(file)) return {};
  const got = {};
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (KEYS.includes(m[1]) && value) got[m[1]] = value;
  }
  return got;
}

/**
 * @returns {{ok: boolean, reason?: string, dest?: string, url?: string}}
 */
export function linkDb() {
  const src = path.join(root, 'youpe-web', '.env.local');
  const got = readTurso(src);
  const missing = KEYS.filter((k) => !got[k]);

  if (missing.length) {
    return {
      ok: false,
      reason: existsSync(src)
        ? `${src} thiếu: ${missing.join(', ')}`
        : `không thấy ${src}`,
    };
  }

  const dest = userEnvPath();
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    '# Sinh bởi `npm run link:db`. Đây là cấu hình cho BẢN ĐÓNG GÓI.\n' +
      '# Sửa youpe-web/.env.local rồi chạy lại lệnh đó, đừng sửa trực tiếp file này.\n\n' +
      KEYS.map((k) => `${k}=${got[k]}`).join('\n') +
      '\n'
  );

  return { ok: true, dest, url: got.TURSO_DATABASE_URL };
}

/* Chạy trực tiếp bằng `npm run link:db` */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = linkDb();
  if (!r.ok) {
    console.error(`✗ ${r.reason}`);
    console.error('  Tạo youpe-web/.env.local với TURSO_DATABASE_URL và TURSO_AUTH_TOKEN.');
    console.error('  Các bước: docs/CONTEXT.md mục 7');
    process.exit(1);
  }
  console.log(`✓ Đã ghi ${r.dest}`);
  console.log(`  ${r.url}`);
  console.log('\nBản đóng gói trên máy này giờ sẽ dùng chung database với chế độ dev.');
}
