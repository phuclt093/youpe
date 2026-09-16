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

/** Trạng thái worker — để /api/debug nói rõ đang trích xuất bằng gì */
export const workerState: {
  python: string | null;
  version: string | null;
  /** Lý do không dùng worker (null = đang dùng hoặc chưa thử) */
  skipped: string | null;
} = { python: null, version: null, skipped: null };

/**
 * So hai số phiên bản yt-dlp kiểu `2026.08.19` / `2026.8.30.232658.dev0`.
 * Chỉ so phần số theo thứ tự, đủ dùng vì yt-dlp đánh số theo ngày.
 */
export function compareYtdlpVersion(a: string, b: string): number {
  const parts = (v: string) => (v.match(/\d+/g) ?? []).map(Number);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Worker có được phép dùng không, xét theo phiên bản.
 *
 * Sự cố 16/09/2026: máy Linux có sẵn `python3` kèm một bản `yt_dlp` cũ (gói apt/pip
 * cài từ lâu). Worker nạp được nên được ưu tiên hơn file exe 2026.08.19 gói kèm —
 * và bản cũ đó vẫn trả JSON "thành công", chỉ có điều toàn URL client MWEB không
 * PO token, UA Chrome 95 ⇒ googlevideo trả 403 cho mọi luồng. Không có lỗi nào
 * được ném ra nên không tầng nào tự rơi về exe.
 *
 * Quy tắc: worker phải **không cũ hơn** bản exe. Không có exe để so thì chấp nhận
 * nhưng cảnh báo nếu đã quá 60 ngày tuổi.
 */
async function versionVerdict(version: string): Promise<string | null> {
  let exeVersion: string | null = null;
  try {
    exeVersion = await (await import('./ytdlp')).ytdlpVersion();
  } catch {
    /* không dò được exe thì chỉ xét tuổi */
  }

  if (exeVersion && compareYtdlpVersion(version, exeVersion) < 0) {
    return `yt_dlp của Python là bản ${version}, cũ hơn file exe ${exeVersion} — dùng exe`;
  }

  const d = /^(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(version);
  if (!exeVersion && d) {
    const days = Math.floor((Date.now() - Date.UTC(+d[1], +d[2] - 1, +d[3])) / 86_400_000);
    if (days > 60) {
      console.warn(
        `[yt-dlp] worker dùng yt_dlp ${version} (${days} ngày tuổi) — dễ bị 403. ` +
          'Chạy: python3 -m pip install -U yt-dlp'
      );
    }
  }
  return null;
}

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

  // Lối thoát khẩn cấp: YTDLP_WORKER=0 là luôn gọi file exe
  if (process.env.YTDLP_WORKER?.trim() === '0') {
    workerState.skipped = 'tắt bằng YTDLP_WORKER=0';
    disabledUntil = Number.POSITIVE_INFINITY;
    return false;
  }

  const script = workerScript();
  if (!existsSync(script)) {
    disabledUntil = Date.now() + RETRY_AFTER_FAIL;
    return false;
  }

  const python = await findPython();
  if (!python) {
    workerState.skipped = 'không có Python kèm gói yt_dlp';
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

    rl.on('line', async (line) => {
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

        const version = typeof msg.version === 'string' ? msg.version : '';
        workerState.python = python;
        workerState.version = version || null;

        // Worker đời cũ (chưa báo version) cũng coi như cũ — không tin được
        const verdict = version
          ? await versionVerdict(version)
          : 'worker không báo phiên bản yt_dlp — dùng exe';
        if (verdict) {
          console.warn(`[yt-dlp] ${verdict}`);
          workerState.skipped = verdict;
          child.kill();
          disabledUntil = Date.now() + RETRY_AFTER_FAIL;
          resolve(false);
          return;
        }

        workerState.skipped = null;
        console.info(`[yt-dlp] worker thường trú đã sẵn sàng (${python}, yt_dlp ${version})`);
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
