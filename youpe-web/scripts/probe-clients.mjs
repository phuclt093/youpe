/**
 * Dò xem client YouTube nào còn trả về luồng adaptive.
 *
 *   npm run probe -- <videoId>
 *   npm run probe -- dQw4w9WgXcQ
 *
 * Vì sao cần: khi app rơi xuống "luồng gộp 360p", nguyên nhân gần như luôn là
 * YouTube ngừng trả format adaptive cho những client mà `ytdlp.ts` đang dùng
 * (mặc định `ios,android,web`). Danh sách client nào còn sống thay đổi vài tháng
 * một lần, nên đoán là vô ích — hỏi thẳng từng cái rồi đọc bảng.
 *
 * Client nào có cột "video riêng" khác 0 thì đặt nó vào `.env.local`:
 *
 *   YTDLP_ARGS=--extractor-args youtube:player_client=tv
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const id = process.argv[2];
if (!id) {
  console.error('Thiếu videoId.  Ví dụ:  npm run probe -- dQw4w9WgXcQ');
  process.exit(1);
}

const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const local = path.resolve(process.cwd(), 'bin', exe);
const bin = process.env.YTDLP_PATH || (existsSync(local) ? local : exe);

/* Danh sách này cố ý rộng — mục đích là tìm ra cái nào còn sống, không phải chạy nhanh */
const CLIENTS = [
  'default', 'tv', 'tv_embedded', 'web', 'web_safari', 'web_embedded',
  'mweb', 'ios', 'android', 'android_vr',
];

const TIMEOUT_MS = 45_000;

function probe(client) {
  return new Promise((resolve) => {
    const args = [
      '-J', '--no-warnings', '--no-playlist', '--skip-download',
      '--no-check-formats', '--ignore-config', '--geo-bypass',
      '--socket-timeout', '8', '--retries', '1', '--extractor-retries', '1',
      '--extractor-args', `youtube:player_client=${client}`,
    ];

    const cookies = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
    if (cookies) args.push('--cookies-from-browser', cookies);
    const cookieFile = process.env.YTDLP_COOKIES_FILE?.trim();
    if (cookieFile) args.push('--cookies', cookieFile);

    args.push(`https://www.youtube.com/watch?v=${id}`);

    const t0 = Date.now();
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));

    const timer = setTimeout(() => p.kill('SIGKILL'), TIMEOUT_MS);

    p.on('close', () => {
      clearTimeout(timer);
      const ms = Date.now() - t0;

      let j = null;
      try {
        j = JSON.parse(out);
      } catch {
        /* rơi xuống nhánh báo lỗi bên dưới */
      }

      // `JSON.parse` nuốt trôi cả chuỗi "null", nên phải kiểm tra hình dạng
      // chứ không chỉ bắt ngoại lệ
      if (!j || !Array.isArray(j.formats)) {
        // Lấy đúng dòng ERROR đầu tiên; phần còn lại của stderr chỉ là nhiễu
        const line =
          err.split('\n').find((l) => /ERROR/i.test(l)) ??
          err.split('\n').find((l) => l.trim()) ??
          'không trả về dữ liệu';
        return resolve({ client, ms, error: line.replace(/^ERROR:\s*/i, '').trim().slice(0, 60) });
      }

      const f = j.formats;
      const has = (x) => x && x !== 'none';
      const video = f.filter((x) => has(x.vcodec) && !has(x.acodec));
      const audio = f.filter((x) => !has(x.vcodec) && has(x.acodec));
      const muxed = f.filter((x) => has(x.vcodec) && has(x.acodec));
      const maxH = Math.max(0, ...video.map((x) => x.height ?? 0), ...muxed.map((x) => x.height ?? 0));

      resolve({ client, ms, video: video.length, audio: audio.length, muxed: muxed.length, maxH });
    });

    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ client, ms: Date.now() - t0, error: e.message.slice(0, 60) });
    });
  });
}

console.log(`yt-dlp: ${bin}`);
console.log(`video : ${id}`);
if (process.env.YTDLP_COOKIES_FROM_BROWSER) console.log(`cookie: ${process.env.YTDLP_COOKIES_FROM_BROWSER}`);
console.log('\nĐang hỏi từng client, mỗi cái tối đa 45 giây…\n');

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('client', 15) + pad('video riêng', 13) + pad('tiếng riêng', 13) + pad('gộp', 6) + pad('cao nhất', 10) + 'thời gian');
console.log('─'.repeat(72));

const good = [];

for (const client of CLIENTS) {
  const r = await probe(client);

  if (r.error) {
    console.log(pad(client, 15) + `\x1b[31m${r.error}\x1b[0m`);
    continue;
  }

  const ok = r.video > 0 && r.audio > 0;
  if (ok) good.push(client);

  console.log(
    (ok ? '\x1b[32m' : '\x1b[33m') + pad(client, 15) + '\x1b[0m' +
      pad(r.video, 13) + pad(r.audio, 13) + pad(r.muxed, 6) +
      pad(r.maxH ? `${r.maxH}p` : '—', 10) + `${(r.ms / 1000).toFixed(1)}s`
  );
}

console.log();

if (!good.length) {
  console.log('\x1b[31mKhông client nào trả về luồng adaptive.\x1b[0m');
  console.log('Nhiều khả năng YouTube đang chặn theo IP hoặc đòi đăng nhập. Thử:');
  console.log('  1. Đóng hẳn trình duyệt rồi chạy lại với YTDLP_COOKIES_FROM_BROWSER=chrome');
  console.log('  2. Cập nhật yt-dlp lên bản nightly: yt-dlp --update-to nightly');
  console.log('  3. Thử qua mạng khác (4G điện thoại) để loại trừ việc IP bị đánh dấu');
} else {
  console.log(`\x1b[32mClient còn dùng được: ${good.join(', ')}\x1b[0m`);
  console.log('\nThêm vào youpe-web/.env.local:');
  console.log(`  YTDLP_ARGS=--extractor-args youtube:player_client=${good.join(',')}`);
}
