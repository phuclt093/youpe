'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Thumb } from '@/components/VideoCard';
import EmptyState from '@/components/EmptyState';
import { PlaylistIcon, TrashIcon } from '@/components/Icons';
import { timeAgoFromMs } from '@/lib/format';
import * as pl from '@/lib/playlists';

export default function PlaylistDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [playlist, setPlaylist] = useState<pl.Playlist | null | undefined>(undefined);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');

  const refresh = useCallback(() => setPlaylist(pl.getPlaylist(id) ?? null), [id]);

  useEffect(() => {
    refresh();
    return pl.onPlaylistsChange(refresh);
  }, [refresh]);

  if (playlist === undefined) return null;

  if (playlist === null) {
    return (
      <EmptyState
        title="Không tìm thấy danh sách này"
        hint="Có thể nó đã bị xoá."
        actionLabel="Về danh sách phát"
        actionHref="/playlists"
      />
    );
  }

  const save = () => {
    const n = name.trim();
    if (n) pl.renamePlaylist(playlist.id, n);
    setRenaming(false);
  };

  return (
    <div className="mx-auto max-w-[1096px] px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {renaming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setRenaming(false);
              }}
              onBlur={save}
              className="rounded-lg border border-yt-border bg-transparent px-3 py-1.5 text-2xl font-bold outline-none focus:border-yt-blue"
            />
          ) : (
            <h1
              onDoubleClick={() => {
                setName(playlist.name);
                setRenaming(true);
              }}
              title="Bấm đúp để đổi tên"
              className="cursor-text text-2xl font-bold"
            >
              {playlist.name}
            </h1>
          )}
          <p className="mt-1 text-sm text-yt-sub">
            {playlist.videos.length} video · cập nhật {timeAgoFromMs(playlist.updatedAt)}
          </p>
        </div>

        <div className="flex gap-2">
          {playlist.videos.length > 0 && (
            <button
              onClick={() => router.push(`/watch?v=${playlist.videos[0].id}`)}
              className="rounded-full bg-yt-text px-4 py-2 text-sm font-medium text-yt-bg hover:bg-white/90"
            >
              Phát tất cả
            </button>
          )}
          <button
            onClick={() => {
              setName(playlist.name);
              setRenaming(true);
            }}
            className="rounded-full bg-yt-chip px-4 py-2 text-sm hover:bg-[#3f3f3f]"
          >
            Đổi tên
          </button>
          <button
            onClick={() => {
              if (confirm(`Xoá danh sách "${playlist.name}"?`)) {
                pl.deletePlaylist(playlist.id);
                router.push('/playlists');
              }
            }}
            className="rounded-full bg-yt-chip px-4 py-2 text-sm hover:bg-[#3f3f3f]"
          >
            Xoá
          </button>
        </div>
      </div>

      {!playlist.videos.length ? (
        <EmptyState
          icon={<PlaylistIcon className="h-8 w-8" />}
          title="Danh sách này còn trống"
          hint="Mở một video rồi bấm Lưu, chọn danh sách này."
          actionLabel="Khám phá video"
          actionHref="/"
        />
      ) : (
        <ul className="space-y-4">
          {playlist.videos.map((v, i) => (
            <li key={v.id} className="group flex flex-col gap-3 sm:flex-row">
              <span className="hidden w-6 shrink-0 pt-6 text-sm text-yt-sub sm:block">
                {i + 1}
              </span>

              <Link href={`/watch?v=${v.id}`} className="w-full shrink-0 sm:w-[246px]">
                <Thumb v={v} />
              </Link>

              <div className="min-w-0 flex-1">
                <Link href={`/watch?v=${v.id}`} className="line-clamp-2 text-base font-medium">
                  {v.title}
                </Link>
                <p className="mt-1 text-xs text-yt-sub">
                  {v.author.name}
                  {v.viewsText && ` · ${v.viewsText}`}
                </p>
                <p className="text-xs text-yt-sub">Thêm {timeAgoFromMs(v.addedAt)}</p>
              </div>

              <button
                onClick={() => pl.removeFromPlaylist(playlist.id, v.id)}
                aria-label="Bỏ khỏi danh sách"
                className="self-start rounded-full p-2 text-yt-sub opacity-0 transition hover:bg-yt-hover hover:text-yt-red group-hover:opacity-100"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
