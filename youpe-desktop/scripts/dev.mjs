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
import net from 'node:net';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const web = path.resolve(root, '..', 'youpe-web');

/** Người dùng chỉ định cổng thì tôn trọng tuyệt đối, không tự đổi */
const FIXED_PORT = process.env.YOUPE_DEV_PORT ? Number(process.env.YOUPE_DEV_PORT) : null;

let PORT = FIXED_PORT ?? 3000;
let URL = `http://localhost:${PORT}`;

const setPort = (p) => {
  PORT = p;
  URL = `http://localhost:${p}`;
};

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

/**
 * Cổng có trống không — thử chiếm chứ không đi hỏi `lsof`.
 *
 * Hỏi `lsof` thì không đáng tin: tiến trình của người dùng khác, hoặc máy bật
 * `hidepid`, là nó trả về rỗng trong khi cổng vẫn đang bị giữ chặt. Tự bind một
 * phát rồi nhả ra mới là câu trả lời thật.
 *
 * Bind vào `::` để trùng đúng cách Next lắng nghe (log lỗi của nó ghi `:::3000`),
 * nếu không thì cổng bị chiếm ở IPv6 mà mình thử IPv4 lại tưởng là trống.
 */
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => resolve(false));
    srv.listen(port, '::', () => srv.close(() => resolve(true)));
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
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

  /*
    Tới đây nghĩa là ping thất bại: không có server youpe nào ở cổng này. Nhưng
    cổng vẫn có thể đang bị thứ khác giữ — hay gặp nhất là chính lần chạy trước
    chưa tắt hẳn sau khi đóng cửa sổ terminal.

    Trước đây gặp cảnh này là chết hẳn với một dòng EADDRINUSE, rồi bắt người dùng
    đi truy xem ai đang giữ cổng — mà `lsof` lắm lúc trả về rỗng nên truy cũng
    chẳng ra. Vỏ desktop ở chế độ đóng gói vốn đã tự xin cổng trống rồi; chế độ
    dev cứ ghim 3000 chỉ vì thói quen. Giờ thì tự né.
  */
  if (!(await portFree(PORT))) {
    if (FIXED_PORT) {
      console.error(
        `✗ Cổng ${PORT} đang bị chiếm, mà bạn đã chỉ định cổng này qua YOUPE_DEV_PORT nên tôi không tự đổi.`
      );
      process.exit(1);
    }
    const next = await freePort();
    console.log(`! Cổng ${PORT} đang bị chiếm, chuyển sang ${next}`);
    setPort(next);
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
  /*
    Lưới an toàn. Cổng vừa được kiểm tra là trống ngay phía trên, nhưng giữa lúc
    kiểm và lúc Next bind vẫn có kẽ hở để tiến trình khác chen vào. Hiếm, nhưng
    nếu xảy ra thì báo ngay thay vì ngồi ping đủ 2 phút rồi mới nói "không phản hồi".
  */
  let portBusy = false;
  const watch = (d) => {
    if (portBusy || !/EADDRINUSE/.test(String(d))) return;
    portBusy = true;
    console.error(
      `\n✗ Cổng ${PORT} bị chiếm mất ngay trước khi Next kịp dùng. Chạy lại lệnh là xong.\n`
    );
    stopWeb();
    process.exit(1);
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
