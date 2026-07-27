import { spawn, type ChildProcessWithoutNullStreams, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import readline from 'node:readline';

const run = promisify(execFile);

/**
 * Quản lý tiến trình yt-dlp thường trú.
 *
 * Bản `yt-dlp.exe` là gói PyInstaller: mỗi lần gọi phải giải nén vào thư mục tạm
 * rồi nạp Python từ đầu, tốn 1–4 giây trước khi làm bất cứ việc gì. Với mỗi video
 * là một lần gọi, khoản đó chiếm phần lớn thời gian chờ.
 *
 * Nếu máy có Python kèm gói `yt_dlp`, ta nạp một lần rồi giữ tiến trình sống,
 * trao đổi bằng JSON qua stdin/stdout. Không có thì im lặng quay về gọi file exe.
 */

type Pending = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let proc: ChildProcessWithoutNullStreams | null = null;
let ready: Promise<boolean> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

/** Đã thử và thất bại thì nghỉ một lúc, đừng dò lại liên tục */
let disabledUntil = 0;
/** Chỉ báo một lần, tránh làm ngập log */
let warnedNoPython = false;
const RETRY_AFTER_FAIL = 30 * 60_000;

const workerScript = () =>
  path.resolve(process.cwd(), 'scripts', 'ytdlp_worker.py');

/** Tìm lệnh Python có sẵn gói yt_dlp */
async function findPython(): Promise<string | null> {
  const fromEnv = process.env.YTDLP_PYTHON?.trim();
  const candidates = fromEnv
    ? [fromEnv]
    : process.platform === 'win32'
      ? ['python', 'py', 'python3']
      : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      await run(cmd, ['-c', 'import yt_dlp'], { timeout: 15_000, windowsHide: true });
      return cmd;
    } catch {
      /* thử lệnh tiếp theo */
    }
  }
  return null;
}

function cleanup(reason: string) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(`worker dừng: ${reason}`));
  }
  pending.clear();
  proc = null;
  ready = null;
}

async function start(): Promise<boolean> {
  if (Date.now() < disabledUntil) return false;

  const script = workerScript();
  if (!existsSync(script)) {
    disabledUntil = Date.now() + RETRY_AFTER_FAIL;
    return false;
  }

  const python = await findPython();
  if (!python) {
    // Đây chỉ là tối ưu thêm cho máy nào sẵn có Python, không phải yêu cầu.
    // Không có thì chạy bằng file exe gói kèm, mọi thứ vẫn hoạt động đầy đủ.
    if (!warnedNoPython) {
      warnedNoPython = true;
      console.info('[yt-dlp] dùng file exe gói kèm');
    }
    disabledUntil = Date.now() + RETRY_AFTER_FAIL;
    return false;
  }

  const child = spawn(
    python,
    [
      script,
      process.env.YTDLP_SOCKET_TIMEOUT ?? '5',
      process.env.YTDLP_COOKIES_FROM_BROWSER ?? '',
      process.env.YTDLP_COOKIES_FILE ?? '',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
  );

  proc = child;

  child.stderr.on('data', (d) => {
    const s = String(d).trim();
    if (s) console.warn('[yt-dlp worker]', s.split('\n').slice(-2).join(' '));
  });

  child.on('exit', (code) => cleanup(`mã ${code}`));
  child.on('error', (e) => cleanup(e.message));

  const rl = readline.createInterface({ input: child.stdout });

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const boot = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      disabledUntil = Date.now() + RETRY_AFTER_FAIL;
      resolve(false);
    }, 30_000);

    rl.on('line', (line) => {
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }

      // dòng đầu tiên báo worker đã nạp xong yt_dlp
      if (!settled && typeof msg.ready === 'boolean') {
        settled = true;
        clearTimeout(boot);

        if (!msg.ready) {
          child.kill();
          disabledUntil = Date.now() + RETRY_AFTER_FAIL;
          resolve(false);
          return;
        }

        console.info(`[yt-dlp] worker thường trú đã sẵn sàng (${python})`);
        resolve(true);
        return;
      }

      const p = pending.get(msg.rid);
      if (!p) return;
      pending.delete(msg.rid);
      clearTimeout(p.timer);

      if (msg.ok) p.resolve(msg.data);
      else p.reject(new Error(msg.error ?? 'worker lỗi không rõ'));
    });
  });
}

export async function workerAvailable(): Promise<boolean> {
  if (proc && ready) return ready;
  if (Date.now() < disabledUntil) return false;

  ready = start();
  return ready;
}

/** Lấy JSON thông tin video qua worker. Ném lỗi nếu worker không dùng được. */
export async function extractViaWorker(id: string, allClients = false): Promise<any> {
  if (!(await workerAvailable()) || !proc) {
    throw new Error('worker không sẵn sàng');
  }

  const rid = nextId++;
  const child = proc;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(rid);
      reject(new Error('worker quá thời gian chờ'));
    }, Number(process.env.YTDLP_TIMEOUT_MS ?? 45_000));

    pending.set(rid, { resolve, reject, timer });

    try {
      child.stdin.write(JSON.stringify({ rid, id, allClients }) + '\n');
    } catch (e: any) {
      pending.delete(rid);
      clearTimeout(timer);
      reject(e);
    }
  });
}

/** Gọi lúc khởi động để worker nạp sẵn, video đầu tiên khỏi phải chờ */
export function warmWorker() {
  workerAvailable().catch(() => {});
}

export function stopWorker() {
  proc?.kill();
  cleanup('đóng theo yêu cầu');
}
