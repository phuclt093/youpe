/**
 * Khởi động chế độ phát triển bằng một lệnh duy nhất.
 *
 * Vỏ Electron ở chế độ dev chỉ trỏ vào server Next đang chạy sẵn. Trước đây phải mở
 * hai terminal và tự nhớ thứ tự — quên bước đầu là cửa sổ trắng kèm
 * ERR_CONNECTION_REFUSED, chẳng nói lên điều gì.
 *
 * Script này kiểm tra cổng trước. Chưa có server thì tự chạy `npm run dev` bên
 * youpe-web, chờ tới khi nó trả lời rồi mới mở cửa sổ. Đóng Electron thì tắt luôn
 * server nếu chính nó khởi động.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const web = path.resolve(root, '..', 'youpe-web');

const PORT = Number(process.env.YOUPE_DEV_PORT ?? 3000);
const URL = `http://localhost:${PORT}`;

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

function ping() {
  return new Promise((resolve) => {
    const req = http.get(URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitUntilUp(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let webProc = null;

async function ensureWeb() {
  if (await ping()) {
    console.log(`✓ Đã có server ở ${URL}, dùng luôn`);
    return;
  }

  if (!existsSync(web)) {
    console.error(`✗ Không thấy youpe-web ở ${web}`);
    process.exit(1);
  }

  if (!existsSync(path.join(web, 'node_modules'))) {
    console.log('→ Cài thư viện cho youpe-web (lần đầu, mất vài phút)...');
    await new Promise((resolve, reject) => {
      const p = spawn(npm, ['install', '--no-audit', '--no-fund'], {
        cwd: web,
        stdio: 'inherit',
        shell: isWin,
      });
      p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`npm install lỗi ${c}`))));
    });
  }

  console.log('→ Khởi động youpe-web...');
  webProc = spawn(npm, ['run', 'dev'], {
    cwd: web,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
  });

  /**
   * Bắt `EADDRINUSE` ngay thay vì ngồi chờ hết 2 phút.
   *
   * Lỗi này hiện ra ở giây đầu tiên, nhưng vòng chờ bên dưới không biết đọc log
   * nên vẫn ping đủ 120 giây rồi mới báo "không phản hồi" — một câu chẳng nói lên
   * điều gì, trong khi nguyên nhân đã nằm sờ sờ phía trên. Tệ hơn: cổng bị chiếm
   * thường là do chính lần chạy trước còn sót lại, nên người dùng dễ tưởng app hỏng.
   */
  let portBusy = false;
  const watch = (d) => {
    const s = String(d);
    if (!portBusy && /EADDRINUSE/.test(s)) {
      portBusy = true;
      console.error(
        `\n✗ Cổng ${PORT} đang bị tiến trình khác chiếm — nhiều khả năng là lần chạy trước chưa tắt hẳn.\n\n` +
          '  Xem ai đang giữ:\n' +
          (isWin ? `    netstat -ano | findstr :${PORT}\n` : `    lsof -i :${PORT}\n`) +
          '  Tắt nó:\n' +
          (isWin
            ? '    taskkill /PID <pid> /F\n'
            : `    kill $(lsof -t -i:${PORT})\n`) +
          `\n  Hoặc dùng cổng khác:  YOUPE_DEV_PORT=3100 npm run dev\n`
      );
      stopWeb();
      process.exit(1);
    }
  };

  webProc.stdout.on('data', (d) => {
    watch(d);
    process.stdout.write(`[web] ${d}`);
  });
  webProc.stderr.on('data', (d) => {
    watch(d);
    process.stderr.write(`[web] ${d}`);
  });

  // Next ở chế độ dev biên dịch lần đầu khá lâu
  const ok = await waitUntilUp(120_000);
  if (!ok) {
    console.error('✗ youpe-web không phản hồi sau 2 phút. Xem log [web] ở trên.');
    stopWeb();
    process.exit(1);
  }

  console.log(`✓ youpe-web đã sẵn sàng ở ${URL}`);
}

function stopWeb() {
  if (!webProc) return;
  try {
    if (isWin) spawn('taskkill', ['/pid', String(webProc.pid), '/f', '/t']);
    else webProc.kill('SIGTERM');
  } catch {
    /* đang tắt rồi */
  }
  webProc = null;
}

await ensureWeb();

console.log('→ Mở cửa sổ Electron...');

const electron = spawn(npm, ['exec', '--', 'electron', '.'], {
  cwd: root,
  env: { ...process.env, YOUPE_DEV_URL: URL },
  stdio: 'inherit',
  shell: isWin,
});

electron.on('exit', (code) => {
  stopWeb();
  process.exit(code ?? 0);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopWeb();
    process.exit(0);
  });
}
