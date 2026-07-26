/**
 * Lớp dự phòng khi InnerTube bị SABR-gate (format không kèm URL).
 *
 * Ý tưởng lấy từ chính YMusic: trong `innertube/requests/Player.kt`, khi
 * playabilityStatus != "OK" nó gọi một instance Piped rồi ghép URL trả về
 * vào từng format. Ở đây làm tương tự nhưng lấy cả video lẫn audio.
 *
 * Hỗ trợ 2 loại API:
 *   - Piped:     GET {host}/streams/{id}      -> { videoStreams, audioStreams }
 *   - Invidious: GET {host}/api/v1/videos/{id} -> { adaptiveFormats }
 */

export type PipedFormat = {
  url: string;
  mimeType: string;
  codecs: string;
  bitrate: number;
  itag: number;
  kind: 'video' | 'audio' | 'muxed';
  width?: number;
  height?: number;
  fps?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  initStart?: number;
  initEnd?: number;
  indexStart?: number;
  indexEnd?: number;
  contentLength?: number;
};

export type PipedResult = {
  source: string;
  title: string;
  durationSec: number;
  isLive: boolean;
  hls?: string;
  formats: PipedFormat[];
};

const DEFAULT_PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.darkness.services',
];

const DEFAULT_INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
];

function envList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

export const pipedHosts = () => envList('PIPED_INSTANCES', DEFAULT_PIPED);
export const invidiousHosts = () => envList('INVIDIOUS_INSTANCES', DEFAULT_INVIDIOUS);

/** Mọi host được phép đi qua /api/stream */
export function allowedProxyHosts(): string[] {
  return [...pipedHosts(), ...invidiousHosts()]
    .map((h) => {
      try {
        return new URL(h).hostname;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function splitMime(mime: string): { mimeType: string; codecs: string } {
  const [type, ...rest] = (mime ?? '').split(';');
  const codecs = rest.join(';').match(/codecs="?([^"]+)"?/)?.[1] ?? '';
  return { mimeType: (type ?? '').trim(), codecs };
}

/**
 * Phương án cuối khi instance không trả codec: tra theo itag.
 * shaka bắt buộc phải có codecs trong manifest mới phát được.
 */
const ITAG_CODEC: Record<number, string> = {
  // video mp4 / h264
  133: 'avc1.4d400d', 134: 'avc1.4d401e', 135: 'avc1.4d401f', 136: 'avc1.4d401f',
  137: 'avc1.640028', 160: 'avc1.4d400c', 298: 'avc1.4d4020', 299: 'avc1.64002a',
  // video webm / vp9
  242: 'vp9', 243: 'vp9', 244: 'vp9', 247: 'vp9', 248: 'vp9', 271: 'vp9',
  278: 'vp9', 302: 'vp9', 303: 'vp9', 308: 'vp9', 313: 'vp9', 315: 'vp9',
  // video av1
  394: 'av01.0.00M.08', 395: 'av01.0.01M.08', 396: 'av01.0.04M.08',
  397: 'av01.0.05M.08', 398: 'av01.0.08M.08', 399: 'av01.0.09M.08',
  // audio
  139: 'mp4a.40.5', 140: 'mp4a.40.2', 141: 'mp4a.40.2',
  249: 'opus', 250: 'opus', 251: 'opus', 171: 'vorbis',
};

/** Piped để codec ở field `codec` riêng; Invidious nhét trong `type`. */
function resolveCodecs(raw: any, mimeFallback: string, itag: number): string {
  const direct = (raw?.codec ?? raw?.codecs ?? '').toString().trim();
  if (direct) return direct;
  if (mimeFallback) return mimeFallback;
  return ITAG_CODEC[itag] ?? '';
}

const num = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'youpe/0.1', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/* ---------------- Piped ---------------- */

function parsePiped(host: string, j: any): PipedResult {
  const map = (s: any, kind: 'video' | 'audio' | 'muxed'): PipedFormat | null => {
    if (!s?.url) return null;
    const { mimeType, codecs: fromMime } = splitMime(s.mimeType ?? '');
    const itag = num(s.itag) ?? 0;
    return {
      url: s.url,
      mimeType,
      codecs: resolveCodecs(s, fromMime, itag),
      bitrate: num(s.bitrate) ?? 0,
      itag,
      kind,
      width: num(s.width),
      height: num(s.height),
      fps: num(s.fps),
      audioSampleRate: num(s.audioSampleRate),
      audioChannels: num(s.audioTrackChannels) ?? (kind === 'audio' ? 2 : undefined),
      initStart: num(s.initStart),
      initEnd: num(s.initEnd),
      indexStart: num(s.indexStart),
      indexEnd: num(s.indexEnd),
      contentLength: num(s.contentLength),
    };
  };

  const formats: PipedFormat[] = [
    ...(j.videoStreams ?? []).map((s: any) =>
      map(s, s.videoOnly === false ? 'muxed' : 'video')
    ),
    ...(j.audioStreams ?? []).map((s: any) => map(s, 'audio')),
  ].filter(Boolean) as PipedFormat[];

  return {
    source: `piped:${new URL(host).hostname}`,
    title: j.title ?? '',
    durationSec: num(j.duration) ?? 0,
    isLive: !!j.livestream,
    hls: j.hls ?? undefined,
    formats,
  };
}

/* ---------------- Invidious ---------------- */

function parseInvidious(host: string, j: any): PipedResult {
  const formats: PipedFormat[] = (j.adaptiveFormats ?? [])
    .map((s: any): PipedFormat | null => {
      if (!s?.url) return null;
      const { mimeType, codecs: fromMime } = splitMime(s.type ?? '');
      const kind: 'video' | 'audio' = mimeType.startsWith('audio') ? 'audio' : 'video';
      const [initStart, initEnd] = (s.init ?? '').split('-').map(num);
      const [indexStart, indexEnd] = (s.index ?? '').split('-').map(num);
      const itag = num(s.itag) ?? 0;
      return {
        url: s.url,
        mimeType,
        codecs: resolveCodecs(s, fromMime, itag),
        bitrate: num(s.bitrate) ?? 0,
        itag,
        kind,
        width: num(s.width),
        height: num(s.height),
        fps: num(s.fps),
        audioSampleRate: num(s.audioSampleRate),
        audioChannels: num(s.audioChannels) ?? (kind === 'audio' ? 2 : undefined),
        initStart,
        initEnd,
        indexStart,
        indexEnd,
        contentLength: num(s.clen),
      };
    })
    .filter(Boolean) as PipedFormat[];

  for (const s of j.formatStreams ?? []) {
    if (!s?.url) continue;
    const { mimeType, codecs: fromMime } = splitMime(s.type ?? '');
    const itag = num(s.itag) ?? 0;
    formats.push({
      url: s.url,
      mimeType,
      codecs: resolveCodecs(s, fromMime, itag),
      bitrate: num(s.bitrate) ?? 0,
      itag,
      kind: 'muxed',
      width: num(s.width),
      height: num(s.height),
      fps: num(s.fps),
    });
  }

  return {
    source: `invidious:${new URL(host).hostname}`,
    title: j.title ?? '',
    durationSec: num(j.lengthSeconds) ?? 0,
    isLive: !!j.liveNow,
    hls: j.hlsUrl ?? undefined,
    formats,
  };
}

/* ---------------- public ---------------- */

export type FallbackAttempt = { host: string; note: string };

/** Xoay vòng qua các instance, trả về kết quả đầu tiên có format dùng được */
export async function getFromFallback(
  id: string
): Promise<{ result: PipedResult; tried: FallbackAttempt[] }> {
  const timeout = Number(process.env.FALLBACK_TIMEOUT_MS ?? 4000);
  const tried: FallbackAttempt[] = [];

  const jobs: Promise<PipedResult>[] = [
    ...pipedHosts().map(async (host) => {
      const r = parsePiped(host, await fetchJson(`${host}/streams/${id}`, timeout));
      if (!r.formats.length && !r.hls) throw new Error('không có format');
      return r;
    }),
    ...invidiousHosts().map(async (host) => {
      const r = parseInvidious(host, await fetchJson(`${host}/api/v1/videos/${id}`, timeout));
      if (!r.formats.length && !r.hls) throw new Error('không có format');
      return r;
    }),
  ];

  // gọi song song, lấy instance nào trả lời trước — nhanh hơn nhiều so với thử tuần tự
  const settled = await Promise.allSettled(jobs);
  const win = settled.find((s) => s.status === 'fulfilled') as
    | PromiseFulfilledResult<PipedResult>
    | undefined;

  settled.forEach((s, i) => {
    const host = [...pipedHosts(), ...invidiousHosts()][i];
    tried.push({
      host,
      note: s.status === 'fulfilled' ? `OK (${s.value.formats.length} format)` : String((s as any).reason?.message ?? ''),
    });
  });

  if (win) return { result: win.value, tried };

  throw new Error(
    'Mọi instance Piped/Invidious đều không dùng được — ' +
      tried.map((t) => `${new URL(t.host).hostname}: ${t.note}`).join(' | ')
  );
}
