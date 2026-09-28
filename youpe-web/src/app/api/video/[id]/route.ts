import { NextRequest, NextResponse } from 'next/server';
import { getYT, collectVideos, txt, bestThumb } from '@/lib/innertube';
import type { VideoDetail } from '@/lib/types';
import { resolveStreams, warmStreams } from '@/lib/sources';
import { isBiliId } from '@/lib/bili';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENT = (process.env.YT_CLIENT || 'IOS') as any;


export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  /*
    Bilibili.tv: InnerTube không biết id này. Metadata do chính yt-dlp trả về cùng
    lúc với danh sách luồng, nên chỉ cần gọi resolveStreams (có cache sẵn — lát nữa
    trình phát hỏi /api/streams là lấy ngay bản này, không chạy yt-dlp lần hai).
  */
  if (isBiliId(id)) {
    try {
      const { result } = await resolveStreams(id);
      const detail: VideoDetail = {
        id,
        title: result.title,
        description: result.description ?? '',
        views: null,
        viewsText: '',
        likes: null,
        likesText: '',
        publishedText: 'Bilibili.tv',
        isLive: result.isLive,
        durationSec: result.durationSec || null,
        keywords: [],
        channel: {
          id: '',
          name: result.uploader || 'Bilibili.tv',
          avatar: '',
          subsText: 'Bilibili.tv',
          verified: false,
        },
        related: [],
        manifest: `/api/manifest/${id}`,
        manifestType: 'dash',
        captions: [],
        storyboard: null,
        thumbnail: result.thumbnail ?? '',
      };
      return NextResponse.json(detail);
    } catch (e: any) {
      // resolveStreams ghép lỗi dạng "yt-dlp: <lời giải thích>" — bỏ phần tên nguồn
      // đi, người xem chỉ cần câu giải thích
      const msg = String(e?.message ?? 'không mở được video Bilibili').replace(/^yt-dlp:\s*/, '');
      return NextResponse.json({ error: msg }, { status: 200 });
    }
  }

  // chạy nền song song với việc lấy metadata, để lúc player hỏi thì đã có sẵn
  warmStreams(id);

  try {
    const yt = await getYT();

    // Metadata dùng client mặc định chứ không dùng YT_CLIENT: các client cho TV
    // không trả về watch_next_feed nên cột đề xuất bên phải sẽ trống.
    let info: any;
    try {
      info = await yt.getInfo(id);
    } catch {
      info = await yt.getInfo(id, CLIENT);
    }
    const b = info.basic_info ?? {};
    const sec = info.secondary_info ?? {};
    const pri = info.primary_info ?? {};
    const owner = sec?.owner ?? {};

    const captions =
      (info.captions?.caption_tracks ?? []).map((c: any) => ({
        label: txt(c.name),
        lang: c.language_code,
        url: `/api/stream?u=${encodeURIComponent(c.base_url + '&fmt=vtt')}`,
      })) ?? [];

    const detail: VideoDetail = {
      id,
      title: b.title ?? txt(pri.title) ?? '',
      description: info.description ?? txt(sec.description) ?? '',
      views: b.view_count ?? null,
      viewsText: txt(pri.view_count?.view_count) || '',
      likes: b.like_count ?? null,
      likesText: txt(info.basic_info?.like_count) || '',
      publishedText: txt(pri.published) || txt(pri.relative_date) || b.publish_date || '',
      isLive: !!b.is_live,
      durationSec: b.duration ?? null,
      keywords: b.keywords ?? [],
      channel: {
        id: owner?.author?.id ?? b.channel_id ?? b.channel?.id ?? '',
        name: txt(owner?.author?.name) || b.author || b.channel?.name || '',
        avatar: bestThumb(owner?.author?.thumbnails),
        subsText: txt(owner?.subscriber_count) || '',
        verified: !!owner?.author?.is_verified,
      },
      // gợi ý đầy đủ do /api/related lo, ở đây chỉ trả phần có sẵn cho nhanh
      related: collectVideos(info.watch_next_feed ?? [], 24).filter((v) => v.id !== id),
      manifest: `/api/manifest/${id}`,
      manifestType: b.is_live ? 'hls' : 'dash',
      captions,
      storyboard: null,
    };

    return NextResponse.json(detail);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'không tải được video' }, { status: 500 });
  }
}
