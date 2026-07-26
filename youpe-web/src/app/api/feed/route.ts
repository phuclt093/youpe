import { NextRequest, NextResponse } from 'next/server';
import { getYT, collectVideos } from '@/lib/innertube';
import { topicByKey } from '@/lib/topics';
import type { VideoItem } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** browse thô — cho các feed youtubei.js không bọc sẵn (vd trending) */
async function browse(yt: any, browseId: string, params?: string) {
  const payload: any = { browseId, parse: true };
  if (params) payload.params = params;
  return yt.actions.execute('/browse', payload);
}

/**
 * Giữ lại đối tượng feed của lần gọi trước để còn gọi getContinuation() được.
 * youtubei.js bọc token phân trang bên trong đối tượng nên không truyền qua HTTP,
 * cách gọn nhất là nhớ nó ở server trong thời gian ngắn.
 */
const CURSOR_TTL = 10 * 60_000;
const cursors = new Map<string, { at: number; feed: any }>();

function putCursor(key: string, feed: any) {
  cursors.set(key, { at: Date.now(), feed });
  for (const [k, v] of cursors) if (Date.now() - v.at > CURSOR_TTL) cursors.delete(k);
  if (cursors.size > 60) cursors.delete(cursors.keys().next().value as string);
}

function getCursor(key: string) {
  const hit = cursors.get(key);
  if (!hit || Date.now() - hit.at > CURSOR_TTL) return null;
  return hit.feed;
}

/** Chạy lần lượt các cách lấy feed, cách nào ra video thì dùng */
async function firstOk(
  attempts: { name: string; run: () => Promise<any> }[]
): Promise<{ videos: VideoItem[]; via: string; feed: any; errors: string[] }> {
  const errors: string[] = [];

  for (const a of attempts) {
    try {
      const feed = await a.run();
      const videos = collectVideos(feed, 48);
      if (videos.length) return { videos, via: a.name, feed, errors };
      errors.push(`${a.name}: rỗng`);
    } catch (e: any) {
      errors.push(`${a.name}: ${e?.message ?? e}`);
    }
  }

  return { videos: [], via: 'none', feed: null, errors };
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('tab') || 'home';
  const more = req.nextUrl.searchParams.get('more') === '1';
  const cursorKey = req.nextUrl.searchParams.get('cursor') || key;
  const topic = topicByKey(key);

  try {
    const yt: any = await getYT();

    /* ---------- nạp thêm ---------- */
    if (more) {
      const prev = getCursor(cursorKey);
      if (!prev?.getContinuation) return NextResponse.json({ videos: [], done: true });

      try {
        const next = await prev.getContinuation();
        const videos = collectVideos(next, 48);
        if (videos.length) putCursor(cursorKey, next);
        return NextResponse.json({ videos, done: !videos.length });
      } catch (e: any) {
        return NextResponse.json({ videos: [], done: true, error: e?.message });
      }
    }

    /* ---------- nạp lần đầu ---------- */
    let attempts: { name: string; run: () => Promise<any> }[];

    if (topic.kind === 'home') {
      attempts = [
        { name: 'getHomeFeed', run: () => yt.getHomeFeed() },
        { name: 'browse:FEwhat_to_watch', run: () => browse(yt, 'FEwhat_to_watch') },
        { name: 'browse:FEtrending', run: () => browse(yt, 'FEtrending') },
        { name: 'search:fallback', run: () => yt.search('video hay', { type: 'video' }) },
      ];
    } else if (topic.kind === 'browse') {
      attempts = [
        { name: `browse:${topic.browseId}`, run: () => browse(yt, topic.browseId!, topic.params) },
        {
          name: 'search:fallback',
          run: () => yt.search(topic.query ?? topic.label, { type: 'video' }),
        },
      ];
    } else {
      attempts = [
        {
          name: `search:${topic.key}`,
          run: () => yt.search(topic.query ?? topic.label, { type: 'video' }),
        },
      ];
    }

    const { videos, via, feed, errors } = await firstOk(attempts);
    if (feed) putCursor(cursorKey, feed);

    return NextResponse.json({
      videos,
      via,
      label: topic.label,
      canLoadMore: typeof feed?.getContinuation === 'function',
      error: videos.length ? undefined : errors.join(' | '),
    });
  } catch (e: any) {
    return NextResponse.json(
      { videos: [], via: 'none', error: e?.message ?? 'feed error' },
      { status: 200 }
    );
  }
}
