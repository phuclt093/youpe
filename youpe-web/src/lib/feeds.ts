import { videosFrom } from './innertube';
import type { VideoItem } from './types';

/**
 * Mấy cách lấy feed dùng chung cho /api/feed và /api/home.
 *
 * Trước đây chuỗi dự phòng này chỉ nằm trong /api/feed. /api/home thì gọi đúng một
 * lần `getHomeFeed()`, hỏng là nuốt lỗi rồi trả mảng rỗng — nên khi YouTube đổi
 * cấu trúc feed chủ (chuyện xảy ra vài tháng một lần) thì trang chủ đen thui,
 * không một dòng thông báo, trong khi tab "Thịnh hành" ngay bên cạnh vẫn chạy vì
 * nó có đường lui. Gom vào đây để cả hai cùng được hưởng.
 */

export type Attempt = { name: string; run: () => Promise<any> };

/** browse thô — cho các feed youtubei.js không bọc sẵn (vd trending) */
export async function browse(yt: any, browseId: string, params?: string) {
  const payload: any = { browseId, parse: true };
  if (params) payload.params = params;
  return yt.actions.execute('/browse', payload);
}

/** Chạy lần lượt các cách lấy feed, cách nào ra video thì dùng */
export async function firstOk(
  attempts: Attempt[],
  limit = 48
): Promise<{ videos: VideoItem[]; via: string; feed: any; errors: string[] }> {
  const errors: string[] = [];

  for (const a of attempts) {
    try {
      const feed = await a.run();
      const videos = videosFrom(feed, limit);
      if (videos.length) return { videos, via: a.name, feed, errors };
      errors.push(`${a.name}: rỗng`);
    } catch (e: any) {
      errors.push(`${a.name}: ${e?.message ?? e}`);
    }
  }

  return { videos: [], via: 'none', feed: null, errors };
}

/** Chuỗi cách lấy feed chung, xếp từ đúng nhất tới chắc ăn nhất */
export function homeAttempts(yt: any): Attempt[] {
  return [
    { name: 'getHomeFeed', run: () => yt.getHomeFeed() },
    { name: 'browse:FEwhat_to_watch', run: () => browse(yt, 'FEwhat_to_watch') },
    { name: 'browse:FEtrending', run: () => browse(yt, 'FEtrending') },
    { name: 'search:fallback', run: () => yt.search('video hay', { type: 'video' }) },
  ];
}
