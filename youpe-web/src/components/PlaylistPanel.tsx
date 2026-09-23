'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlaylistIcon } from '@/components/Icons';
import * as pl from '@/lib/playlists';
import type { VideoItem } from '@/lib/types';

/**
 * Hàng chờ của danh sách phát đang xem — khối nằm trên cùng cột phải, giống
 * YouTube: đang mở video nào trong danh sách thì thấy luôn các video còn lại.
 *
 * `listId` lấy từ `?list=` trên URL:
 *   - "PL..." / "RD..."  → danh sách của YouTube, hỏi /api/playlist
 *   - "my:<id>"          → danh sách tự tạo, nằm trong máy người dùng
 */
export type Queue = {
  id: string;
  title: string;
  author: string;
  videos: VideoItem[];
  loading: boolean;
  error: string;
};

const LOCAL = 'my:';

/**
 * Nhớ danh sách đã tải trong phiên này.
 *
 * Chuyển sang video kế tiếp trong danh sách là trang xem dựng lại từ đầu — không
 * nhớ thì mỗi lần chuyển video lại gọi /api/playlist một lần, khối hàng chờ nháy
 * trắng rồi mới hiện lại.
 */
const memo = new Map<string, Queue>();

export function usePlaylistQueue(listId: string): Queue | null {
  const [q, setQ] = useState<Queue | null>(null);

  useEffect(() => {
    if (!listId) {
      setQ(null);
      return;
    }

    if (listId.startsWith(LOCAL)) {
      const read = () => {
        const p = pl.getPlaylist(listId.slice(LOCAL.length));
        setQ({
          id: listId,
          title: p?.name ?? 'Danh sách phát',
          author: 'Danh sách của bạn',
          videos: p?.videos ?? [],
          loading: false,
          error: p ? '' : 'Không tìm thấy danh sách này trong máy.',
        });
      };
      read();
      return pl.onPlaylistsChange(read);
    }

    const cached = memo.get(listId);
    if (cached) {
      setQ(cached);
      return;
    }

    let alive = true;
    setQ({ id: listId, title: 'Danh sách phát', author: '', videos: [], loading: true, error: '' });

    fetch(`/api/playlist/${listId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const q: Queue = {
          id: listId,
          title: j.title ?? 'Danh sách phát',
          author: j.author?.name ?? '',
          videos: j.videos ?? [],
          loading: false,
          error: j.error ?? '',
        };
        if (!q.error && q.videos.length) memo.set(listId, q);
        setQ(q);
      })
      .catch((e) => {
        if (!alive) return;
        setQ({ id: listId, title: 'Danh sách phát', author: '', videos: [], loading: false, error: String(e?.message ?? e) });
      });

    return () => {
      alive = false;
    };
  }, [listId]);

  return q;
}

/** Link tới trang chi tiết của danh sách; danh sách tự tạo nằm ở /playlists */
export function listHref(listId: string) {
  return listId.startsWith(LOCAL) ? `/playlists/${listId.slice(LOCAL.length)}` : `/list/${listId}`;
}

export default function PlaylistPanel({ queue, currentId }: { queue: Queue; currentId: string }) {
  const index = queue.videos.findIndex((v) => v.id === currentId);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-yt-border bg-yt-elev">
      <div className="border-b border-yt-border px-4 py-3">
        <Link href={listHref(queue.id)} className="line-clamp-1 text-base font-medium hover:underline">
          {queue.title}
        </Link>
        <p className="mt-0.5 line-clamp-1 text-xs text-yt-sub">
          {[queue.author, queue.videos.length ? `${index >= 0 ? index + 1 : '–'}/${queue.videos.length}` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {queue.loading && (
        <div className="space-y-2 p-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <div className="skeleton h-[56px] w-[100px] shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!queue.loading && queue.error && (
        <p className="px-4 py-3 text-sm text-yt-sub">{queue.error}</p>
      )}

      {!queue.loading && !queue.error && (
        /*
          Cuộn riêng trong khối và tự đưa video đang phát vào tầm nhìn — danh sách
          200 video mà đổ hết ra cột phải thì phần "Video đề xuất" bị đẩy đi rất xa.
        */
        <ul className="max-h-[420px] overflow-y-auto py-1">
          {queue.videos.map((v, i) => {
            const active = v.id === currentId;
            return (
              <li key={`${v.id}-${i}`}>
                <Link
                  href={`/watch?v=${v.id}&list=${encodeURIComponent(queue.id)}`}
                  ref={(el) => {
                    if (active && el) el.scrollIntoView({ block: 'nearest' });
                  }}
                  className={`flex gap-2 px-2 py-1.5 ${active ? 'bg-yt-hover' : 'hover:bg-yt-hover'}`}
                >
                  <span className="grid w-5 shrink-0 place-items-center self-center text-[11px] text-yt-sub">
                    {active ? (
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-yt-text" fill="currentColor" aria-hidden>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>

                  <div className="relative h-[56px] w-[100px] shrink-0 overflow-hidden rounded-lg bg-yt-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {v.durationText && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white">
                        {v.durationText}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 py-0.5">
                    <p className={`line-clamp-2 text-xs leading-4 ${active ? 'font-medium' : ''}`}>{v.title}</p>
                    <p className="mt-1 line-clamp-1 text-[11px] text-yt-sub">{v.author.name}</p>
                  </div>
                </Link>
              </li>
            );
          })}

          {!queue.videos.length && (
            <li className="px-4 py-3 text-sm text-yt-sub">Danh sách này chưa có video nào.</li>
          )}
        </ul>
      )}

      <Link
        href={listHref(queue.id)}
        className="flex items-center gap-2 border-t border-yt-border px-4 py-2.5 text-xs font-medium text-yt-sub hover:bg-yt-hover hover:text-yt-text"
      >
        <PlaylistIcon className="h-4 w-4" />
        Xem toàn bộ danh sách phát
      </Link>
    </div>
  );
}
