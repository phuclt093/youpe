import type { PipedResult } from './piped';
import { getFromFallback } from './piped';
import { getFromYtdlp } from './ytdlp';
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

export type ResolveOutcome = {
  result: PipedResult;
  tried: { source: string; note: string }[];
  cached?: boolean;
};

/** URL của googlevideo sống khoảng 6 tiếng; cache 20 phút là an toàn */
const TTL = Number(process.env.STREAM_CACHE_TTL_MS ?? 20 * 60 * 1000);
const cache = new Map<string, { at: number; outcome: ResolveOutcome }>();

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
        tried.push({ source: step.source, note: `OK — ${result.formats.length} format` });
        preferred = step.source;
        const outcome: ResolveOutcome = { result, tried };
        cache.set(id, { at: Date.now(), outcome });
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
