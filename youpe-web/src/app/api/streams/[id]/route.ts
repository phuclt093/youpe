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

  const t0 = Date.now();

  try {
    const { result, tried, cached } = await resolveStreams(id);
    const ms = Date.now() - t0;
    console.info(
      `[streams ${id}] ${result.source} · ${ms}ms${cached ? ' (cache)' : ''} · ${result.formats.length} format`
    );

    // DASH chỉ dựng được khi format có sẵn init/index range.
    // yt-dlp không trả các range này, nên khi nguồn là yt-dlp thì đi thẳng chế độ 2 luồng.
    const dashReady =
      !result.isLive &&
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
      label: f.height ? `${f.height}p${f.fps && f.fps > 30 ? Math.round(f.fps) : ''}` : '',
    });

    // ưu tiên mp4/h264 cho video (tương thích rộng nhất), m4a cho audio
    const prefer = (a: PipedFormat, b: PipedFormat) => {
      const score = (f: PipedFormat) =>
        (f.mimeType.includes('mp4') ? 2 : 0) + (f.codecs.startsWith('avc') ? 1 : 0);
      return score(b) - score(a);
    };

    const video = result.formats
      .filter((f) => f.kind === 'video' && f.height)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || prefer(a, b))
      .map(shape);

    // Chọn audio bitrate vừa phải chứ không phải cao nhất: 320kbps chỉ làm
    // thời gian nạp ban đầu dài ra mà tai thường không phân biệt nổi.
    const TARGET_AUDIO = Number(process.env.AUDIO_TARGET_BPS ?? 128_000);
    const audio = result.formats
      .filter((f) => f.kind === 'audio')
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
      dash: dashReady ? `/api/manifest/${id}` : null,
      title: result.title,
      duration: result.durationSec,
      isLive: result.isLive,
      hls: result.hls ? proxy(result.hls) : null,
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
