import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PipedResult } from './piped';
import { getFromFallback } from './piped';
import { getFromYtdlp } from './ytdlp';
import { warmWorker } from './ytdlp-worker';
import { getPlayableInfo } from './player';

/** Đổi VideoInfo của youtubei.js sang cùng shape với các nguồn khác */
async function fromInnertube(id: string): Promise<PipedResult> {
  const { info, client } = await getPlayableInfo(id);
  const b = info.basic_info ?? {};
  const all = [
    ...(info.streaming_data?.adaptive_formats ?? []),
    ...(info.streaming_data?.formats ?? []),
  ];

  const formats = await Promise.all(
    all.map(async (f: any) => {
      let url: string = f.url ?? '';
      if (!url && typeof f.decipher === 'function') {
        try {
          url = await f.decipher();
        } catch {
          return null;
        }
      }
      if (!url) return null;

      const mime: string = f.mime_type ?? '';
      const [type] = mime.split(';');
      const codecs = mime.match(/codecs="?([^"]+)"?/)?.[1] ?? '';
      const kind: 'video' | 'audio' | 'muxed' =
        f.has_video && f.has_audio ? 'muxed' : f.has_video ? 'video' : 'audio';

      return {
        url,
        mimeType: (type ?? '').trim(),
        codecs,
        bitrate: f.bitrate ?? 0,
        itag: f.itag ?? 0,
        kind,
        width: f.width,
        height: f.height,
        fps: f.fps,
        audioSampleRate: f.audio_sample_rate,
        audioChannels: f.audio_channels,
        initStart: f.init_range?.start,
        initEnd: f.init_range?.end,
        indexStart: f.index_range?.start,
        indexEnd: f.index_range?.end,
        contentLength: f.content_length,
      };
    })
  );

  return {
    source: `innertube:${client}`,
    title: b.title ?? '',
    durationSec: b.duration ?? 0,
    isLive: !!b.is_live,
    hls: info.streaming_data?.hls_manifest_url,
    formats: formats.filter(Boolean) as any,
  };
}

/**
 * Lấy master playlist HLS cho video trực tiếp.
 *
 * yt-dlp không phải lúc nào cũng để `manifest_url` trong JSON, tuỳ phiên bản và
 * tuỳ luồng. Nhưng InnerTube thì luôn trả `hls_manifest_url` cho live — và điều
 * quan trọng là trường này **không bị SABR chặn**, vì nó là đường dẫn tới manifest
 * chứ không phải URL của một format cụ thể.
 */
async function liveHlsFromInnertube(id: string): Promise<string | undefined> {
  try {
    const yt: any = await (await import('./innertube')).getYT();
    for (const client of ['IOS', 'WEB', 'ANDROID', 'TV_EMBEDDED']) {
      try {
        const info: any = await yt.getInfo(id, client as any);
        const url = info?.streaming_data?.hls_manifest_url;
        if (url) return url;
      } catch {
        /* thử client tiếp theo */
      }
    }
  } catch {
    /* không khởi tạo được InnerTube */
  }
  return undefined;
}

export type ResolveOutcome = {
  result: PipedResult;
  tried: { source: string; note: string }[];
  cached?: boolean;
};

/** URL của googlevideo sống khoảng 6 tiếng; cache 20 phút là an toàn */
const TTL = Number(process.env.STREAM_CACHE_TTL_MS ?? 20 * 60 * 1000);
const cache = new Map<string, { at: number; outcome: ResolveOutcome }>();

/**
 * Cache ghi luôn xuống đĩa.
 *
 * Lý do: lúc phát triển, server khởi động lại liên tục — mỗi lần như vậy cache
 * trong RAM mất sạch và phải chạy lại yt-dlp cho những video vừa xem xong.
 * Ghi ra file thì mở lại video cũ là phát ngay.
 *
 * Video trực tiếp không cache: URL của nó hết hạn rất nhanh.
 */
const dataDir = process.env.YOUPE_DATA_DIR || path.resolve(process.cwd(), 'data');
// đổi tên khi cấu trúc dữ liệu thay đổi, để bản ghi cũ tự bị bỏ qua
const cacheFile = path.join(dataDir, 'stream-cache-v2.json');

let flushTimer: NodeJS.Timeout | null = null;

function loadDisk() {
  try {
    if (!existsSync(cacheFile)) return;
    const raw = JSON.parse(readFileSync(cacheFile, 'utf-8')) as Record<
      string,
      { at: number; outcome: ResolveOutcome }
    >;
    const now = Date.now();
    for (const [id, entry] of Object.entries(raw)) {
      if (now - entry.at < TTL) cache.set(id, entry);
    }
  } catch {
    /* file hỏng thì bỏ qua, cache lại từ đầu */
  }
}

function saveDisk() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      mkdirSync(dataDir, { recursive: true });
      const obj: Record<string, unknown> = {};
      const now = Date.now();
      for (const [id, entry] of cache) {
        if (now - entry.at < TTL && !entry.outcome.result.isLive) obj[id] = entry;
      }
      const tmp = cacheFile + '.tmp';
      writeFileSync(tmp, JSON.stringify(obj), 'utf-8');
      renameSync(tmp, cacheFile);
    } catch {
      /* không ghi được cũng không sao, chỉ mất phần tăng tốc */
    }
  }, 2000);
}

const gg = globalThis as any;
if (!gg.__youpeCacheLoaded) {
  gg.__youpeCacheLoaded = true;
  loadDisk();
  // nạp sẵn worker để video đầu tiên không phải chờ khởi động
  warmWorker();
}

/** Nguồn nào vừa thắng thì lần sau thử trước — bỏ qua các tầng đã biết là hỏng */
let preferred: string | null = null;

/**
 * Các lời gọi đang bay, gom theo videoId.
 * Trang xem gọi warmStreams() còn trình phát gọi /api/streams gần như cùng lúc;
 * không gom lại thì yt-dlp bị chạy hai lần cho cùng một video.
 */
const inflight = new Map<string, Promise<ResolveOutcome>>();

function prune() {
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k);
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
}

/**
 * Thử lần lượt các nguồn, lấy nguồn đầu tiên có format kèm URL thật.
 * Mặc định: yt-dlp -> InnerTube -> Piped/Invidious, nhưng nguồn thắng gần nhất
 * luôn được đẩy lên đầu.
 */
export async function resolveStreams(id: string): Promise<ResolveOutcome> {
  prune();

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.outcome, cached: true };

  const flying = inflight.get(id);
  if (flying) return flying;

  const job = resolveUncached(id).finally(() => inflight.delete(id));
  inflight.set(id, job);
  return job;
}

async function resolveUncached(id: string): Promise<ResolveOutcome> {
  const tried: { source: string; note: string }[] = [];

  const steps: { source: string; run: () => Promise<PipedResult> }[] = [
    { source: 'yt-dlp', run: () => getFromYtdlp(id) },
    { source: 'innertube', run: () => fromInnertube(id) },
    { source: 'piped/invidious', run: async () => (await getFromFallback(id)).result },
  ];

  if (preferred) {
    const i = steps.findIndex((s) => s.source === preferred);
    if (i > 0) steps.unshift(steps.splice(i, 1)[0]);
  }

  for (const step of steps) {
    try {
      const result = await step.run();
      if (result.formats.length || result.hls) {
        // Live bắt buộc phải có HLS. Thiếu thì đi hỏi InnerTube — nếu vẫn không có
        // thì các format rời kia là đoạn cố định, xem một lúc sẽ đứng hình.
        if (result.isLive && !result.hls) {
          result.hls = await liveHlsFromInnertube(id);
        }

        tried.push({
          source: step.source,
          note: result.isLive
            ? `OK — trực tiếp${result.hls ? ' (HLS)' : ' (KHÔNG có HLS)'}`
            : `OK — ${result.formats.length} format`,
        });
        preferred = step.source;

        const outcome: ResolveOutcome = { result, tried };

        // Live không cache: URL hết hạn rất nhanh và nội dung thay đổi liên tục
        if (!result.isLive) {
          cache.set(id, { at: Date.now(), outcome });
          saveDisk();
        }
        return outcome;
      }
      tried.push({ source: step.source, note: 'không có format nào kèm URL' });
    } catch (e: any) {
      tried.push({ source: step.source, note: e?.message ?? String(e) });
    }
  }

  throw new Error(tried.map((t) => `${t.source}: ${t.note}`).join(' || '));
}

/** Gọi trước để làm nóng cache, không quan tâm kết quả */
export function warmStreams(id: string) {
  if (cache.has(id) || inflight.has(id)) return;
  resolveStreams(id).catch(() => {});
}
