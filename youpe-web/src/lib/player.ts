import { getYT } from './innertube';

/**
 * YouTube đang chuyển dần sang SABR: nhiều client trả về format KHÔNG kèm URL
 * (chỉ có server_abr_streaming_url), khiến toDash() ném "No valid URL to decipher".
 * Các client dưới đây vẫn trả URL trực tiếp — thử lần lượt cho tới khi được.
 */
const CANDIDATES = [
  'TV_EMBEDDED',
  'WEB_EMBEDDED',
  'TV',
  'IOS',
  'ANDROID',
  'MWEB',
  'WEB',
] as const;

export type ClientName = (typeof CANDIDATES)[number];

/** Thứ tự thử: client trong .env trước, rồi tới các client còn lại */
function order(): string[] {
  const pref = process.env.YT_CLIENT?.trim().toUpperCase();
  const rest = CANDIDATES.filter((c) => c !== pref);
  return pref ? [pref, ...rest] : [...CANDIDATES];
}

/** Đếm số format thực sự phát được (có url hoặc có cipher để giải) */
export function playableFormats(info: any): number {
  const fmts = [
    ...(info?.streaming_data?.adaptive_formats ?? []),
    ...(info?.streaming_data?.formats ?? []),
  ];
  return fmts.filter((f: any) => f?.url || f?.signature_cipher || f?.cipher).length;
}

/** Nhớ client nào vừa dùng được để lần sau khỏi dò lại từ đầu */
let lastGood: string | null = null;

/**
 * Khi cả 7 client đều bị SABR-gate thì lần sau khỏi dò lại — mỗi lần dò là 7
 * request mạng vô ích, đủ làm trang xem đứng vài giây.
 */
let allGatedUntil = 0;
const GATE_TTL = Number(process.env.SABR_GATE_TTL_MS ?? 10 * 60 * 1000);

export type PlayableResult = {
  info: any;
  client: string;
  tried: { client: string; formats: number; note: string }[];
};

export async function getPlayableInfo(id: string): Promise<PlayableResult> {
  if (Date.now() < allGatedUntil) {
    throw new Error(
      'bỏ qua — lần thử gần đây cho thấy mọi client đều bị SABR-gate ' +
        `(thử lại sau ${Math.ceil((allGatedUntil - Date.now()) / 1000)}s)`
    );
  }

  const yt: any = await getYT();
  const list = lastGood ? [lastGood, ...order().filter((c) => c !== lastGood)] : order();
  const tried: { client: string; formats: number; note: string }[] = [];

  for (const client of list) {
    try {
      const info = await yt.getInfo(id, client as any);
      const n = playableFormats(info);
      const status = info?.playability_status?.status ?? '';
      const reason = info?.playability_status?.reason ?? '';

      if (n > 0) {
        lastGood = client;
        tried.push({ client, formats: n, note: 'OK' });
        return { info, client, tried };
      }

      tried.push({
        client,
        formats: 0,
        note: info?.streaming_data?.server_abr_streaming_url
          ? 'chỉ có SABR, không có URL trực tiếp'
          : `${status}${reason ? ' — ' + reason : ''}` || 'không có streaming_data',
      });
    } catch (e: any) {
      tried.push({ client, formats: 0, note: e?.message ?? String(e) });
    }
  }

  if (tried.every((t) => t.note.includes('SABR'))) allGatedUntil = Date.now() + GATE_TTL;

  const detail = tried.map((t) => `${t.client}: ${t.note}`).join(' | ');
  throw new Error(
    `Không client nào trả về URL phát được. Chi tiết — ${detail}. ` +
      `Video có thể cần PoToken (xem mục Xử lý sự cố trong README).`
  );
}
