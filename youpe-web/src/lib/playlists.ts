'use client';

import type { VideoItem } from './types';
import { remotePull, remotePushAll, remoteRemove, remoteUpsert } from './sync';

/**
 * Danh sách phát tự tạo, lưu ở máy.
 *
 * Trước đây trang /playlists luôn trống vì không có chỗ nào ghi dữ liệu vào —
 * nút "Lưu" ở trang xem chỉ bật tắt "Xem sau". Đây là phần còn thiếu.
 */

export type PlaylistVideo = VideoItem & { addedAt: number };

export type Playlist = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  videos: PlaylistVideo[];
};

const KEY = 'youpe.playlistsV2';
const EVENT = 'youpe-playlists';
const MAX_VIDEOS = 500;

function read(): Playlist[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(list: Playlist[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Đẩy một danh sách phát lên server.
 *
 * Cả danh sách đi cùng một lần, kể cả khi chỉ thêm một video. Danh sách phát là
 * một khối gắn liền — tên, thứ tự, nội dung — tách nhỏ ra thì phải nghĩ tới
 * chuyện trộn khi hai máy sửa cùng lúc, mà lợi ích chẳng đáng.
 */
const push = (p: Playlist) => remoteUpsert('playlists', p);

/** Kéo về sau khi đăng nhập, ghi đè bản ở máy */
export async function pullPlaylists(): Promise<Playlist[]> {
  const items = await remotePull('playlists');
  if (!items.length) return read();
  const list = items.map((i) => ({ ...(i as Playlist) }));
  write(list);
  return list;
}

/** Đẩy tất cả những gì đang có ở máy lên — gọi ngay sau lần đăng nhập đầu */
export const pushPlaylists = () => remotePushAll('playlists', read());

function newId(): string {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------- đọc ---------------- */

export function getPlaylists(): Playlist[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPlaylist(id: string): Playlist | undefined {
  return read().find((p) => p.id === id);
}

/** Những playlist đang chứa video này — dùng để tích sẵn trong hộp chọn */
export function playlistsContaining(videoId: string): string[] {
  return read()
    .filter((p) => p.videos.some((v) => v.id === videoId))
    .map((p) => p.id);
}

/* ---------------- ghi ---------------- */

export function createPlaylist(name: string, firstVideo?: VideoItem): Playlist {
  const now = Date.now();
  const pl: Playlist = {
    id: newId(),
    name: name.trim() || 'Danh sách mới',
    createdAt: now,
    updatedAt: now,
    videos: firstVideo ? [{ ...firstVideo, addedAt: now }] : [],
  };

  write([pl, ...read()]);
  push(pl);
  return pl;
}

export function renamePlaylist(id: string, name: string) {
  const next = read().map((p) =>
    p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p
  );
  write(next);
  const changed = next.find((p) => p.id === id);
  if (changed) push(changed);
}

export function deletePlaylist(id: string) {
  write(read().filter((p) => p.id !== id));
  remoteRemove('playlists', id);
}

export function addToPlaylist(id: string, video: VideoItem) {
  const next = read().map((p) => {
    if (p.id !== id) return p;
    if (p.videos.some((v) => v.id === video.id)) return p;

    return {
      ...p,
      updatedAt: Date.now(),
      videos: [{ ...video, addedAt: Date.now() }, ...p.videos].slice(0, MAX_VIDEOS),
    };
  });
  write(next);
  const changed = next.find((p) => p.id === id);
  if (changed) push(changed);
}

export function removeFromPlaylist(id: string, videoId: string) {
  const next = read().map((p) =>
    p.id === id
      ? { ...p, updatedAt: Date.now(), videos: p.videos.filter((v) => v.id !== videoId) }
      : p
  );
  write(next);
  const changed = next.find((p) => p.id === id);
  if (changed) push(changed);
}

/** Bật tắt video trong một playlist, trả về trạng thái mới */
export function toggleInPlaylist(id: string, video: VideoItem): boolean {
  const pl = getPlaylist(id);
  if (!pl) return false;

  if (pl.videos.some((v) => v.id === video.id)) {
    removeFromPlaylist(id, video.id);
    return false;
  }
  addToPlaylist(id, video);
  return true;
}

export function onPlaylistsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
