/**
 * Kiểm tra kết nối Turso mà không cần khởi động cả app.
 *
 *   npm run db:check
 *
 * Dựng app lên rồi mới biết sai thì mất thời gian và thông báo lỗi thường bị vùi
 * trong log của Next. Script này nói thẳng: nối được hay không, sai ở đâu, và
 * hiện đang có bao nhiêu dòng dữ liệu.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client/web';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
  Tự đọc .env.local: script này chạy bằng node trần chứ không qua Next, nên không
  có ai nạp hộ. Chỉ lấy những khoá còn trống trong môi trường, để lúc cần vẫn
  ghi đè được bằng biến môi trường thật.
*/
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (value && process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadEnv(path.join(root, '.env.local'));
loadEnv(path.join(root, '.env'));

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('✗ Chưa có TURSO_DATABASE_URL.');
  console.error('  Thêm vào youpe-web/.env.local:');
  console.error('    TURSO_DATABASE_URL=libsql://ten-db-tai-khoan.turso.io');
  console.error('    TURSO_AUTH_TOKEN=ey...');
  console.error('  Các bước lấy hai giá trị này: docs/DB-CLOUD.md');
  process.exit(1);
}

// Nhắc sớm còn hơn để nó thành lỗi 401 khó hiểu ở dưới
if (!authToken && !url.startsWith('file:')) {
  console.warn('⚠ Có URL nhưng thiếu TURSO_AUTH_TOKEN — gần như chắc chắn sẽ bị từ chối.');
}

console.log(`→ Đang nối tới ${url}`);

const db = createClient({ url, authToken });
const t0 = Date.now();

try {
  await db.execute('SELECT 1');
  console.log(`✓ Nối được (${Date.now() - t0}ms)`);
} catch (e) {
  console.error('✗ Không nối được:', e?.message ?? e);
  console.error('  Kiểm tra lại URL và token, và xem database đã bị xoá chưa.');
  process.exit(1);
}

const wanted = ['users', 'sessions', 'library'];
const found = new Set(
  (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) =>
    String(r.name)
  )
);

const missing = wanted.filter((t) => !found.has(t));
if (missing.length === wanted.length) {
  console.log('· Chưa có bảng nào — bình thường nếu app chưa chạy lần nào.');
  console.log('  Khởi động app một lần là bảng được dựng tự động.');
} else if (missing.length) {
  console.log(`⚠ Thiếu bảng: ${missing.join(', ')}`);
}

for (const table of wanted) {
  if (!found.has(table)) continue;
  const r = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  console.log(`  ${table.padEnd(9)} ${r.rows[0].n} dòng`);
}

console.log('\nXong.');
