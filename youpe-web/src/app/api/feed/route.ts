import { NextRequest, NextResponse } from 'next/server';
import { getYT, videosFrom } from '@/lib/innertube';
import { browse, firstOk, homeAttempts, type Attempt } from '@/lib/feeds';
import { topicByKey } from '@/lib/topics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
        const videos = videosFrom(next, 48);
        if (videos.length) putCursor(cursorKey, next);
        return NextResponse.json({ videos, done: !videos.length });
      } catch (e: any) {
        return NextResponse.json({ videos: [], done: true, error: e?.message });
      }
    }

    /* ---------- nạp lần đầu ---------- */
    let attempts: Attempt[];

    if (topic.kind === 'home') {
      attempts = homeAttempts(yt);
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
