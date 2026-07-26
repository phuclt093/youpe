import { NextRequest, NextResponse } from 'next/server';
import { getYT, collectVideos, txt, bestThumb } from '@/lib/innertube';
import type { VideoDetail } from '@/lib/types';
import { warmStreams } from '@/lib/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENT = (process.env.YT_CLIENT || 'IOS') as any;


export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

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
