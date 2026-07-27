'use client';

import { useEffect, useState } from 'react';
import { CloseIcon, ClockIcon, CheckIcon, PlaylistIcon } from './Icons';
import * as store from '@/lib/storage';
import * as pl from '@/lib/playlists';
import type { VideoItem } from '@/lib/types';

/** Hộp chọn nơi lưu video: Xem sau, các playlist đã có, hoặc tạo playlist mới */
export default function SaveToPlaylist({
  video,
  onClose,
}: {
  video: VideoItem;
  onClose: () => void;
}) {
  const [lists, setLists] = useState<pl.Playlist[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [later, setLater] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const refresh = () => {
    setLists(pl.getPlaylists());
    setChecked(new Set(pl.playlistsContaining(video.id)));
    setLater(store.has('later', video.id));
  };

  useEffect(refresh, [video.id]);

  const create = () => {
    const n = name.trim();
    if (!n) return;
    pl.createPlaylist(n, video);
    setName('');
    setCreating(false);
    refresh();
  };

  return (
    <div
      className="anim-fade-in fixed inset-0 z-[140] grid place-items-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-pop w-full max-w-sm overflow-hidden rounded-2xl bg-yt-elev shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-medium">Lưu video vào…</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-yt-hover" aria-label="Đóng">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto px-2 pb-2">
          <Row
            icon={<ClockIcon className="h-5 w-5" />}
            label="Xem sau"
            checked={later}
            onClick={() => {
              store.toggle('later', video);
              refresh();
            }}
          />

          {lists.map((p) => (
            <Row
              key={p.id}
              icon={<PlaylistIcon className="h-5 w-5" />}
              label={p.name}
              sub={`${p.videos.length} video`}
              checked={checked.has(p.id)}
              onClick={() => {
                pl.toggleInPlaylist(p.id, video);
                refresh();
              }}
            />
          ))}
        </div>

        <div className="border-t border-yt-border p-3">
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
                className="min-w-0 flex-1 rounded-lg border border-yt-border bg-transparent px-3 py-2 text-sm outline-none focus:border-yt-blue"
              />
              <button
                onClick={create}
                className="rounded-lg bg-yt-text px-3 py-2 text-sm font-medium text-yt-bg hover:bg-white/90"
              >
                Tạo
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-yt-blue hover:bg-yt-hover"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
              </svg>
              Tạo danh sách mới
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  sub,
  checked,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-yt-hover"
    >
      <span className="shrink-0 text-yt-sub">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        {sub && <span className="block text-xs text-yt-sub">{sub}</span>}
      </span>
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
          checked ? 'border-yt-text bg-yt-text text-yt-bg' : 'border-yt-sub'
        }`}
      >
        {checked && <CheckIcon className="h-4 w-4" />}
      </span>
    </button>
  );
}
