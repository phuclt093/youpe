'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';
import { PlaylistIcon, TrashIcon } from '@/components/Icons';
import { timeAgoFromMs } from '@/lib/format';
import * as pl from '@/lib/playlists';

export default function PlaylistsPage() {
  const [lists, setLists] = useState<pl.Playlist[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const refresh = useCallback(() => setLists(pl.getPlaylists()), []);

  useEffect(() => {
    refresh();
    return pl.onPlaylistsChange(refresh);
  }, [refresh]);

  const create = () => {
    const n = name.trim();
    if (!n) return;
    pl.createPlaylist(n);
    setName('');
    setCreating(false);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Danh sách phát</h1>

        {creating ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder="Tên danh sách"
              className="rounded-full border border-yt-border bg-transparent px-4 py-2 text-sm outline-none focus:border-yt-blue"
            />
            <button
              onClick={create}
              className="rounded-full bg-yt-text px-4 py-2 text-sm font-medium text-yt-bg hover:bg-white/90"
            >
              Tạo
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-[#3f3f3f]"
          >
            Tạo danh sách mới
          </button>
        )}
      </div>

      {!lists.length ? (
        <EmptyState
          icon={<PlaylistIcon className="h-8 w-8" />}
          title="Chưa có danh sách phát nào"
          hint="Bấm Lưu ở trang xem video để thêm vào một danh sách, hoặc tạo danh sách trống trước."
          actionLabel="Tạo danh sách mới"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {lists.map((p, i) => (
            <Card key={p.id} playlist={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ playlist: p, index }: { playlist: pl.Playlist; index: number }) {
  const cover = p.videos[0]?.thumbnail;

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
      className="anim-fade-up group flex flex-col"
    >
      <Link href={`/playlists/${p.id}`} className="relative block">
        {/* hai lớp lệch phía sau gợi ý đây là một tập video */}
        <div className="absolute inset-x-3 -top-1.5 h-3 rounded-t-lg bg-yt-elev/60" />
        <div className="absolute inset-x-1.5 -top-0.5 h-3 rounded-t-lg bg-yt-elev" />

        <div className="card-thumb relative aspect-video w-full overflow-hidden rounded-xl bg-yt-elev">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-yt-sub">
              <PlaylistIcon className="h-8 w-8" />
            </div>
          )}

          <div className="absolute bottom-0 right-0 flex h-full w-[45%] flex-col items-center justify-center bg-black/70 text-xs">
            <PlaylistIcon className="mb-1 h-5 w-5" />
            {p.videos.length} video
          </div>
        </div>
      </Link>

      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/playlists/${p.id}`} className="line-clamp-2 text-[15px] font-medium">
            {p.name}
          </Link>
          <p className="mt-1 text-[13px] text-yt-sub">
            Cập nhật {timeAgoFromMs(p.updatedAt)}
          </p>
        </div>

        <button
          onClick={() => {
            if (confirm(`Xoá danh sách "${p.name}"?`)) pl.deletePlaylist(p.id);
          }}
          aria-label="Xoá danh sách"
          className="rounded-full p-1.5 text-yt-sub opacity-0 transition hover:bg-yt-hover hover:text-yt-red group-hover:opacity-100"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
