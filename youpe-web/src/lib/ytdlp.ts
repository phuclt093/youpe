import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { extractViaWorker, workerAvailable } from './ytdlp-worker';
import type { PipedFormat, PipedResult } from './piped';

const run = promisify(execFile);

/**
 * yt-dlp làm tầng trích xuất chính.
 *
 * Lý do: từ khi YouTube bật SABR, endpoint /player không còn trả URL trực tiếp
 * cho bất kỳ client InnerTube nào, và các instance Piped/Invidious công cộng
 * cũng gãy theo. yt-dlp là extractor được cập nhật liên tục và xử lý được
 * PoToken / SABR, nên đặt lên đầu chuỗi.
 */

const num = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function cleanCodec(c?: string): string {
  if (!c || c === 'none') return '';
  return c.split('.').slice(0, 4).join('.');
}

function mimeOf(ext: string, kind: 'video' | 'audio' | 'muxed'): string {
  const container =
    ext === 'webm' ? 'webm' : ext === 'm4a' || ext === 'mp4' ? 'mp4' : ext || 'mp4';
  return `${kind === 'audio' ? 'audio' : 'video'}/${container}`;
}

/**
 * Chiến lược trích xuất.
 *
 * `fast` bỏ qua bớt bước để nhanh hơn, `all` quét mọi player client nên chậm nhưng
 * chắc ăn. Nhớ lại cái nào vừa thắng để lần sau dùng thẳng — nếu không, mỗi video
 * phải chạy yt-dlp hai lượt và mất gấp đôi thời gian.
 */
type Strategy = 'fast' | 'all';
let preferred: Strategy = 'fast';

function ytdlpArgs(id: string, strategy: Strategy): string[] {
  const args = [
    '-J',
    '--no-warnings',
    '--no-playlist',
    '--no-check-formats',
    '--skip-download',
    '--geo-bypass',
    // bỏ qua file cấu hình toàn cục của máy — tránh bị chậm bởi tuỳ chọn lạ
    '--ignore-config',
    // Một client bị treo mà chờ 10 giây là đủ làm cả trang đứng hình.
    '--socket-timeout', process.env.YTDLP_SOCKET_TIMEOUT ?? '5',
    '--retries', '1',
    '--extractor-retries', '1',
  ];

  if (strategy === 'all') {
    args.push('--extractor-args', 'youtube:player_client=all');
  } else {
    args.push('--extractor-args', 'youtube:player_client=ios,android,web');
  }

  const cookies = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (cookies) args.push('--cookies-from-browser', cookies);

  const cookieFile = process.env.YTDLP_COOKIES_FILE?.trim();
  if (cookieFile) args.push('--cookies', cookieFile);

  const proxy = process.env.YTDLP_PROXY?.trim() || process.env.HTTP_PROXY?.trim();
  if (proxy) args.push('--proxy', proxy);

  const extra = process.env.YTDLP_ARGS?.trim();
  if (extra) args.push(...extra.split(/\s+/).filter(Boolean));

  args.push(`https://www.youtube.com/watch?v=${id}`);
  return args;
}

/** Những lỗi mà việc đổi player client có cơ may cứu được */
const RETRYABLE =
  /(not available|unavailable|sign in|confirm you'?re not a bot|failed to extract|no video formats|player response|error code)/i;

/** Dịch lỗi thô của yt-dlp sang câu tiếng Việt nói rõ phải làm gì */
export function explainYtdlpError(raw: string): string {
  const t = raw.toLowerCase();

  if (/private video/.test(t)) return 'Video này ở chế độ riêng tư.';
  if (/members[- ]only|join this channel/.test(t))
    return 'Video chỉ dành cho thành viên của kênh.';
  if (/premiere|premieres in/.test(t)) return 'Video chưa công chiếu.';
  if (/removed|terminated|deleted/.test(t))
    return 'Video đã bị gỡ hoặc kênh đã bị xoá.';
  if (/confirm your age|age[- ]restricted/.test(t))
    return 'Video giới hạn độ tuổi — cần cookie đăng nhập. Đặt YTDLP_COOKIES_FROM_BROWSER=chrome trong .env rồi đóng hẳn Chrome và khởi động lại.';
  if (/confirm you'?re not a bot|sign in to confirm/.test(t))
    return 'YouTube nghi ngờ truy cập tự động. Đặt YTDLP_COOKIES_FROM_BROWSER=chrome trong .env, đóng hẳn Chrome rồi khởi động lại.';
  if (/not available in your country|geo|blocked it in your country/.test(t))
    return 'Video bị chặn ở khu vực của bạn.';
  if (/not available/.test(t))
    return 'YouTube từ chối phát video này — thường là do chặn khu vực, giới hạn nhúng, hoặc cần đăng nhập. Thử thêm cookie: YTDLP_COOKIES_FROM_BROWSER=chrome trong .env.';
  if (/timed out|timeout/.test(t))
    return 'Quá thời gian chờ khi lấy thông tin video. Thử lại, hoặc tăng YTDLP_TIMEOUT_MS.';

  return raw;
}

const isWin = process.platform === 'win32';
const exe = isWin ? 'yt-dlp.exe' : 'yt-dlp';

/**
 * Các chỗ có thể có yt-dlp, thử theo thứ tự.
 * Đặt file vào ./bin là cách gọn nhất — không đụng tới PATH, và deploy đi đâu cũng theo.
 */
function candidates(): string[] {
  const list: string[] = [];

  const fromEnv = process.env.YTDLP_PATH?.trim();
  if (fromEnv) list.push(path.resolve(fromEnv));

  list.push(path.resolve(process.cwd(), 'bin', exe));
  list.push(exe); // PATH

  if (isWin) {
    const local = process.env.LOCALAPPDATA;
    if (local) {
      list.push(path.join(local, 'Microsoft', 'WinGet', 'Links', exe));
      list.push(
        path.join(
          local, 'Microsoft', 'WinGet', 'Packages',
          'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', exe
        )
      );
    }
  } else {
    list.push('/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', '/opt/homebrew/bin/yt-dlp');
  }

  return list;
}

let resolved: { bin: string; version: string } | null = null;
let lastFail = 0;

/**
 * Chỉ cache kết quả THÀNH CÔNG. Thất bại thì chỉ nghỉ 5 giây rồi dò lại,
 * để vừa tải yt-dlp xong là dùng được ngay, không phải restart server.
 */
async function resolveBin(): Promise<{ bin: string; version: string } | null> {
  if (resolved) return resolved;
  if (Date.now() - lastFail < 5_000) return null;

  for (const bin of candidates()) {
    if (path.isAbsolute(bin) && !existsSync(bin)) continue;
    try {
      const { stdout } = await run(bin, ['--version'], { timeout: 10_000, windowsHide: true });
      resolved = { bin, version: stdout.trim() };
      return resolved;
    } catch {
      /* thử cái tiếp theo */
    }
  }

  lastFail = Date.now();
  return null;
}

export function resetYtdlpCache() {
  resolved = null;
  lastFail = 0;
}

/** Báo cáo chi tiết từng đường dẫn đã thử — dùng cho /api/debug */
export async function ytdlpDiagnostics() {
  resetYtdlpCache();
  const searched: { path: string; ton_tai: boolean; ket_qua: string }[] = [];

  for (const bin of candidates()) {
    const absolute = path.isAbsolute(bin);
    const exists = absolute ? existsSync(bin) : true;
    if (absolute && !exists) {
      searched.push({ path: bin, ton_tai: false, ket_qua: 'không có file' });
      continue;
    }
    try {
      const { stdout } = await run(bin, ['--version'], { timeout: 10_000, windowsHide: true });
      searched.push({ path: bin, ton_tai: true, ket_qua: `OK — v${stdout.trim()}` });
    } catch (e: any) {
      searched.push({
        path: bin,
        ton_tai: exists,
        ket_qua: absolute ? `chạy lỗi: ${e?.code ?? e?.message}` : 'không có trong PATH',
      });
    }
  }

  return { cwd: process.cwd(), platform: process.platform, searched };
}

export function ytdlpBin(): string {
  return resolved?.bin ?? process.env.YTDLP_PATH?.trim() ?? exe;
}

export async function isYtdlpAvailable(): Promise<boolean> {
  return (await resolveBin()) !== null;
}

export async function ytdlpVersion(): Promise<string | null> {
  return (await resolveBin())?.version ?? null;
}

/**
 * Đo riêng chi phí khởi động tiến trình.
 *
 * Bản yt-dlp.exe trên Windows là gói PyInstaller: mỗi lần chạy phải giải nén và nạp
 * Python, thường tốn 1–4 giây trước khi làm bất cứ việc gì. Biết con số này mới
 * phân biệt được "chậm vì khởi động" với "chậm vì chờ YouTube".
 */
export async function measureStartup(): Promise<number | null> {
  const bin = (await resolveBin())?.bin;
  if (!bin) return null;

  const t0 = Date.now();
  try {
    await run(bin, ['--version'], { timeout: 30_000, windowsHide: true });
    return Date.now() - t0;
  } catch {
    return null;
  }
}

/** Danh sách nơi đã tìm — để báo lỗi cho rõ */
export function ytdlpSearchPaths(): string[] {
  return candidates();
}

export async function getFromYtdlp(id: string): Promise<PipedResult> {
  if (!(await isYtdlpAvailable())) {
    throw new Error(
      'không tìm thấy yt-dlp. Chạy `npm run setup:ytdlp` để tải tự động về thư mục bin/, ' +
        'hoặc đặt YTDLP_PATH trong .env. Đã tìm ở: ' +
        ytdlpSearchPaths().join(' ; ')
    );
  }

  const exec = async (strategy: Strategy) => {
    const t0 = Date.now();
    try {
      const res = await run(ytdlpBin(), ytdlpArgs(id, strategy), {
        timeout: Number(process.env.YTDLP_TIMEOUT_MS ?? 45_000),
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      });
      console.info(`[yt-dlp ${id}] ${Date.now() - t0}ms (exe/${strategy})`);
      preferred = strategy; // cái nào chạy được thì lần sau dùng thẳng
      return res.stdout;
    } catch (e) {
      console.info(`[yt-dlp ${id}] ${Date.now() - t0}ms (exe/${strategy}) HỎNG`);
      throw e;
    }
  };

  const readErr = (e: any) =>
    (e?.stderr ?? '').toString().trim().split('\n').slice(-3).join(' ') ||
    e?.message ||
    'yt-dlp lỗi không rõ';

  /**
   * Đường nhanh: tiến trình Python thường trú.
   *
   * Bỏ được 1–4 giây khởi động PyInstaller mỗi lần gọi. Chỉ dùng khi máy có Python
   * kèm gói yt_dlp; không có thì im lặng rơi xuống cách gọi file exe bên dưới.
   */
  let j: any = null;

  if (await workerAvailable()) {
    const t0 = Date.now();
    try {
      j = await extractViaWorker(id, preferred === 'all');
      console.info(`[yt-dlp ${id}] ${Date.now() - t0}ms (worker/${preferred})`);
    } catch (e: any) {
      const msg = e?.message ?? String(e);

      if (RETRYABLE.test(msg) && preferred !== 'all') {
        try {
          j = await extractViaWorker(id, true);
          preferred = 'all';
          console.info(`[yt-dlp ${id}] ${Date.now() - t0}ms (worker/all)`);
        } catch (second: any) {
          throw new Error(explainYtdlpError(second?.message ?? String(second)));
        }
      } else if (!/worker/i.test(msg)) {
        // lỗi thật của video, không phải worker hỏng
        throw new Error(explainYtdlpError(msg));
      }
      // worker trục trặc thì để rơi xuống cách gọi file exe
    }
  }

  if (!j) {
    // bắt đầu bằng chiến lược đã thắng lần trước, chỉ thử cái còn lại khi cần
    const order: Strategy[] = preferred === 'all' ? ['all'] : ['fast', 'all'];

    let stdout: string | null = null;
    let lastErr = '';

    for (const strategy of order) {
      try {
        stdout = await exec(strategy);
        break;
      } catch (e: any) {
        lastErr = readErr(e);
        // lỗi thật của video thì dừng luôn, thử tiếp chỉ tốn thời gian
        if (!RETRYABLE.test(lastErr)) throw new Error(explainYtdlpError(lastErr));
      }
    }

    if (!stdout) throw new Error(explainYtdlpError(lastErr));
    j = JSON.parse(stdout);
  }
  const formats: PipedFormat[] = [];

  /**
   * Video trực tiếp không có file hoàn chỉnh để tải theo Range — YouTube phát bằng
   * HLS. yt-dlp để đường dẫn master playlist ở `manifest_url` của các format m3u8.
   * Lấy được cái đó là đủ, không cần danh sách format rời.
   */
  let hls: string | undefined;
  if (j.is_live || j.live_status === 'is_live') {
    const variants = (j.formats ?? []).filter(
      (f: any) => /m3u8/i.test(f.protocol ?? '') || /\.m3u8/i.test(f.url ?? '')
    );

    // Ưu tiên manifest_url (master playlist, có đủ mọi chất lượng) hơn url của một
    // biến thể đơn lẻ — chọn nhầm biến thể thì mất khả năng đổi chất lượng.
    hls =
      variants.find((f: any) => f.manifest_url)?.manifest_url ??
      j.manifest_url ??
      variants.find((f: any) => /\.m3u8/i.test(f.url ?? ''))?.url ??
      undefined;
  }

  for (const f of j.formats ?? []) {
    if (!f?.url) continue;
    // bỏ luồng HLS/DASH-segment, chỉ lấy file phát trực tiếp được
    if (f.protocol && !/^https?$/.test(f.protocol)) continue;

    const hasVideo = f.vcodec && f.vcodec !== 'none';
    const hasAudio = f.acodec && f.acodec !== 'none';
    if (!hasVideo && !hasAudio) continue;

    const kind: 'video' | 'audio' | 'muxed' =
      hasVideo && hasAudio ? 'muxed' : hasVideo ? 'video' : 'audio';

    const codecs = [cleanCodec(f.vcodec), cleanCodec(f.acodec)].filter(Boolean).join(', ');

    formats.push({
      url: f.url,
      mimeType: mimeOf(f.ext, kind),
      codecs,
      bitrate: Math.round((num(f.tbr) ?? num(f.vbr) ?? num(f.abr) ?? 0) * 1000),
      itag: num(f.format_id) ?? 0,
      kind,
      width: num(f.width),
      height: num(f.height),
      fps: num(f.fps),
      audioSampleRate: num(f.asr),
      audioChannels: num(f.audio_channels),
      contentLength: num(f.filesize) ?? num(f.filesize_approx),
    });
  }

  const isLive = !!(j.is_live || j.live_status === 'is_live');

  return {
    source: 'yt-dlp',
    title: j.title ?? '',
    durationSec: num(j.duration) ?? 0,
    isLive,
    hls,
    // Live mà đã có HLS thì bỏ các format rời đi: chúng là đoạn cố định, phát
    // được vài phút rồi đứng, mà lại được ưu tiên hơn HLS ở phía trình phát.
    formats: isLive && hls ? [] : formats,
  };
}
