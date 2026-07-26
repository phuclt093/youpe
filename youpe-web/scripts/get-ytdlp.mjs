/**
 * Tải yt-dlp về ./bin — khỏi phải cài đặt hay đụng tới PATH.
 *   npm run setup:ytdlp
 */
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

const ASSET = {
  win32: 'yt-dlp.exe',
  darwin: 'yt-dlp_macos',
  linux: 'yt-dlp_linux',
}[process.platform];

if (!ASSET) {
  console.error(`Chưa hỗ trợ nền tảng ${process.platform}. Cài thủ công rồi đặt YTDLP_PATH trong .env`);
  process.exit(1);
}

const outName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const outDir = path.resolve(process.cwd(), 'bin');
const outPath = path.join(outDir, outName);
const url = `${BASE}/${ASSET}`;

console.log(`Đang tải ${url}`);

await mkdir(outDir, { recursive: true });

const res = await fetch(url, { redirect: 'follow' });
if (!res.ok || !res.body) {
  console.error(`Tải hỏng: HTTP ${res.status}`);
  process.exit(1);
}

await pipeline(Readable.fromWeb(res.body), createWriteStream(outPath));

if (process.platform !== 'win32') await chmod(outPath, 0o755);

const { size } = await stat(outPath);
console.log(`Xong: ${outPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log('Chạy `npm run dev` rồi mở /api/debug/<videoId> để kiểm tra.');
