import { NextRequest, NextResponse } from 'next/server';
import { resolveStreams } from '@/lib/sources';
import type { PipedFormat } from '@/lib/piped';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/streams/<id>
 * Trả danh sách luồng đã bọc qua proxy, chia sẵn video-only / audio-only / muxed.
 * Player dùng cái này khi DASH không dựng được.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = req.nextUrl.origin;
  const proxy = (u: string) => `${origin}/api/stream?u=${encodeURIComponent(u)}`;

  /**
   * Lọc codec cho thiết bị yếu.
   *
   * Nhiều Android TV box đời rẻ chỉ có bộ giải mã phần cứng cho H.264, gặp VP9
   * hay AV1 là phải giải mã bằng CPU nên giật, gặp Opus thì mất tiếng hẳn.
   *   ?codec=h264   chỉ H.264 + AAC
   *   ?tv=1         viết tắt của codec=h264
   *   ?maxHeight=   chặn trần độ phân giải
   */
  const wantH264 =
    req.nextUrl.searchParams.get('tv') === '1' ||
    req.nextUrl.searchParams.get('codec') === 'h264';
  const maxHeight = Number(req.nextUrl.searchParams.get('maxHeight')) || 0;

  const t0 = Date.now();

  try {
    const { result, tried, cached } = await resolveStreams(id);
    const ms = Date.now() - t0;
    console.info(
      `[streams ${id}] ${result.source} · ${ms}ms${cached ? ' (cache)' : ''} · ${result.formats.length} format`
    );

    // DASH chỉ dựng được khi format có sẵn init/index range.
    // yt-dlp không trả các range này, nên khi nguồn là yt-dlp thì đi thẳng chế độ 2 luồng.
    // Live luôn đi HLS; có HLS rồi thì không dựng DASH nữa
    const dashReady =
      !result.isLive &&
      !result.hls &&
      result.formats.some(
        (f) => f.kind !== 'muxed' && f.initStart != null && f.indexStart != null
      );

    const shape = (f: PipedFormat) => ({
      url: proxy(f.url),
      itag: f.itag,
      mimeType: f.mimeType,
      codecs: f.codecs,
      bitrate: f.bitrate,
      width: f.width ?? null,
      height: f.height ?? null,
      fps: f.fps ?? null,
      label: f.height ? `${f.height}p${f.fps && f.fps > 31 ? Math.round(f.fps) : ''}` : '',
    });

    // Ưu tiên WebM/VP9 mặc định (tương thích 100% với Electron/Chromium trên Linux),
    // ngoại trừ khi yêu cầu đích danh H.264 (?codec=h264 hoặc ?tv=1)
    const prefer = (a: PipedFormat, b: PipedFormat) => {
      const score = (f: PipedFormat) => {
        if (wantH264) {
          return (f.mimeType.includes('mp4') ? 2 : 0) + (f.codecs.startsWith('avc') ? 1 : 0);
        }
        return (f.mimeType.includes('webm') ? 2 : 0) + (f.codecs.startsWith('vp') ? 1 : 0);
      };
      return score(b) - score(a);
    };

    const isH264 = (c: string) => /^avc/i.test(c);
    const isAac = (c: string) => /^mp4a/i.test(c);

    /**
     * Mỗi độ phân giải chỉ giữ một bản.
     *
     * yt-dlp trả về cùng một mức nhiều lần vì YouTube mã hoá bằng nhiều codec khác
     * nhau (H.264, VP9, AV1) — nên menu chất lượng hiện "480p" ba lần. Người xem
     * không quan tâm codec, chỉ cần một dòng cho mỗi mức.
     *
     * Trong các bản cùng độ phân giải thì ưu tiên H.264/mp4: tương thích rộng nhất
     * và giải mã bằng phần cứng trên gần như mọi máy.
     */
    const byHeight = new Map<number, (typeof result.formats)[number]>();
    for (const f of result.formats) {
      if (f.kind !== 'video' || !f.height) continue;
      if (wantH264 && !isH264(f.codecs)) continue;
      if (maxHeight && f.height > maxHeight) continue;

      const cur = byHeight.get(f.height);
      if (!cur || prefer(f, cur) < 0 || (prefer(f, cur) === 0 && f.bitrate > cur.bitrate)) {
        byHeight.set(f.height, f);
      }
    }

    const video = [...byHeight.values()]
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
      .map(shape);

    // Chọn audio bitrate vừa phải chứ không phải cao nhất: 320kbps chỉ làm
    // thời gian nạp ban đầu dài ra mà tai thường không phân biệt nổi.
    const TARGET_AUDIO = Number(process.env.AUDIO_TARGET_BPS ?? 128_000);
    const audio = result.formats
      .filter((f) => f.kind === 'audio')
      .filter((f) => !wantH264 || isAac(f.codecs))
      .sort((a, b) => {
        const p = prefer(a, b);
        if (p) return p;
        return Math.abs(a.bitrate - TARGET_AUDIO) - Math.abs(b.bitrate - TARGET_AUDIO);
      })
      .map(shape);

    const muxed = result.formats
      .filter((f) => f.kind === 'muxed')
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
      .map(shape);

    return NextResponse.json({
      id,
      source: result.source,
      cached: !!cached,
      ms,
      filters: { h264: wantH264, maxHeight: maxHeight || null },
      dash: dashReady ? `/api/manifest/${id}` : null,
      title: result.title,
      duration: result.durationSec,
      isLive: result.isLive,
      hls: result.hls ? proxy(result.hls) : null,
      // báo rõ khi live mà không lấy được HLS, để phía trình phát nói cho người dùng biết
      liveWithoutHls: result.isLive && !result.hls,
      video,
      audio,
      muxed,
      tried,
    });
  } catch (e: any) {
    const detail: string = e?.message ?? 'không lấy được luồng';
    console.error(`[streams ${id}] hỏng sau ${Date.now() - t0}ms —`, detail);

    // Tách phần yt-dlp nói gì ra khỏi phần InnerTube/Piped — người dùng chỉ cần biết
    // câu đầu tiên, phần còn lại để dành cho lúc gỡ lỗi.
    const ytdlpPart = detail.split('||').find((p) => p.trim().startsWith('yt-dlp:'));
    const cleaned = ytdlpPart?.replace(/^\s*yt-dlp:\s*/, '').trim() ?? '';

    let message: string;
    if (/không tìm thấy yt-dlp/.test(detail)) {
      message =
        'Chưa có yt-dlp. Chạy `npm run setup:ytdlp` trong thư mục youpe-web rồi tải lại trang.';
    } else if (cleaned) {
      message = cleaned;
    } else if (/SABR/.test(detail)) {
      message =
        'YouTube không trả về đường dẫn phát cho video này từ bất kỳ nguồn nào.';
    } else {
      message = 'Không lấy được luồng phát cho video này.';
    }

    return NextResponse.json({ error: message, detail }, { status: 500 });
  }
}
