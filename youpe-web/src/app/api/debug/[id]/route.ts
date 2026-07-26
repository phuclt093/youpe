import { NextRequest, NextResponse } from 'next/server';
import { getYT } from '@/lib/innertube';
import { playableFormats } from '@/lib/player';
import { getFromFallback } from '@/lib/piped';
import {
  isYtdlpAvailable, ytdlpVersion, getFromYtdlp, ytdlpDiagnostics, measureStartup,
} from '@/lib/ytdlp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENTS = ['TV_EMBEDDED', 'WEB_EMBEDDED', 'TV', 'IOS', 'ANDROID', 'MWEB', 'WEB'];

/** GET /api/debug/<videoId> — xem từng nguồn trả về gì */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const innertube: any[] = [];

  // ---- yt-dlp ----
  let ytdlp: any;
  if (!(await isYtdlpAvailable())) {
    ytdlp = {
      installed: false,
      huong_dan:
        'Chạy `npm run setup:ytdlp` trong thư mục youpe-web để tải yt-dlp về ./bin, ' +
        'rồi tải lại trang này (không cần restart server).',
      chan_doan: await ytdlpDiagnostics(),
    };
  } else {
    try {
      // đo khởi động trước (chạy --version), rồi mới đo trích xuất thật
      const startupMs = await measureStartup();

      const t0 = Date.now();
      const r = await getFromYtdlp(id);
      const totalMs = Date.now() - t0;

      ytdlp = {
        installed: true,
        version: await ytdlpVersion(),
        khoi_dong_ms: startupMs,
        trich_xuat_ms: totalMs,
        cho_mang_ms: startupMs != null ? Math.max(0, totalMs - startupMs) : null,
        nhan_xet:
          startupMs != null && totalMs > 0
            ? startupMs / totalMs > 0.5
              ? 'Phần lớn thời gian là khởi động tiến trình — cài yt-dlp bằng pip sẽ nhanh hơn nhiều so với bản .exe'
              : 'Phần lớn thời gian là chờ YouTube trả lời — thử giảm YTDLP_SOCKET_TIMEOUT hoặc giới hạn player_client'
            : null,
        title: r.title,
        duration: r.durationSec,
        formats: r.formats.length,
        video_only: r.formats.filter((f) => f.kind === 'video').length,
        audio_only: r.formats.filter((f) => f.kind === 'audio').length,
        muxed: r.formats.filter((f) => f.kind === 'muxed').length,
        video_heights: [...new Set(r.formats.filter((f) => f.kind === 'video').map((f) => f.height))]
          .filter(Boolean)
          .sort((a: any, b: any) => b - a),
      };
    } catch (e: any) {
      ytdlp = { installed: true, version: await ytdlpVersion(), error: e?.message ?? String(e) };
    }
  }

  try {
    const yt: any = await getYT();
    for (const client of CLIENTS) {
      try {
        const info = await yt.getInfo(id, client as any);
        innertube.push({
          client,
          status: info?.playability_status?.status ?? null,
          reason: info?.playability_status?.reason ?? null,
          adaptive_formats: info?.streaming_data?.adaptive_formats?.length ?? 0,
          playable_formats: playableFormats(info),
          sabr_only:
            !!info?.streaming_data?.server_abr_streaming_url && playableFormats(info) === 0,
          hls: !!info?.streaming_data?.hls_manifest_url,
        });
      } catch (e: any) {
        innertube.push({ client, error: e?.message ?? String(e) });
      }
    }
  } catch (e: any) {
    innertube.push({ error: `không khởi tạo được InnerTube: ${e?.message ?? e}` });
  }

  let fallback: any;
  try {
    const { result, tried } = await getFromFallback(id);
    const withRanges = result.formats.filter(
      (f) => f.initStart != null && f.indexStart != null
    ).length;
    fallback = {
      source: result.source,
      title: result.title,
      duration: result.durationSec,
      is_live: result.isLive,
      formats: result.formats.length,
      formats_dash_ready: withRanges,
      video_heights: [...new Set(result.formats.filter((f) => f.kind === 'video').map((f) => f.height))]
        .filter(Boolean)
        .sort((a: any, b: any) => b - a),
      tried,
    };
  } catch (e: any) {
    fallback = { error: e?.message ?? String(e) };
  }

  const usable = innertube.filter((r) => r.playable_formats > 0).map((r) => r.client);

  let ket_luan: string;
  if (ytdlp?.formats > 0) ket_luan = `Dùng yt-dlp — ${ytdlp.formats} format`;
  else if (usable.length) ket_luan = `Dùng InnerTube — client: ${usable.join(', ')}`;
  else if (fallback?.formats > 0) ket_luan = `Dùng ${fallback.source}`;
  else if (ytdlp?.installed === false)
    ket_luan = 'Không nguồn nào dùng được. Cách sửa nhanh nhất: cài yt-dlp.';
  else ket_luan = 'Không nguồn nào dùng được.';

  return NextResponse.json(
    { id, ket_luan, ytdlp, innertube_usable_clients: usable, innertube, fallback },
    { status: 200 }
  );
}
