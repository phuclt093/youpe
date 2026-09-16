'use client';

import type { VideoItem } from './types';
import { remoteClear, remotePull, remotePushAll, remoteRemove, remoteUpsert } from './sync';
export { setSignedIn } from './sync';

export type StoredVideo = VideoItem & { savedAt: number };

/*
  Không còn `playlists` ở đây.

  Danh sách phát đã chuyển sang `playlists.ts` với khoá `youpe.playlistsV2` và có
  cấu trúc riêng (tên, thứ tự, mảng video). Cái `youpe.playlists` cũ là bản V1,
  không chỗ nào đọc nữa — nhưng `pushAllToServer()` vẫn đẩy nó lên server dưới
  đúng tên danh sách `playlists`, tức là **đè lên chính playlists thật** ngay lần
  đăng nhập đầu của ai còn sót dữ liệu V1.
*/
const KEYS = {
  history: 'youpe.history',
  later: 'youpe.later',
  liked: 'youpe.liked',
} as const;

export type StoreKey = keyof typeof KEYS;

/**
 * Chưa đăng nhập  -> localStorage.
 * Đã đăng nhập    -> localStorage đóng vai cache, đồng thời ghi lên server.
 * Nhờ vậy giao diện phản hồi tức thì, không phải chờ mạng.
 *
 * Cách gọi API nằm ở `sync.ts` — dùng chung với kênh đăng ký và danh sách phát.
 */

function read(key: StoreKey): StoredVideo[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEYS[key]) || '[]');
  } catch {
    return [];
  }
}

function write(key: StoreKey, list: StoredVideo[]) {
  localStorage.setItem(KEYS[key], JSON.stringify(list.slice(0, 500)));
  window.dispatchEvent(new CustomEvent('youpe-store', { detail: key }));
}

export function getList(key: StoreKey): StoredVideo[] {
  return read(key);
}

export function has(key: StoreKey, id: string): boolean {
  return read(key).some((v) => v.id === id);
}

export function add(key: StoreKey, v: VideoItem) {
  const list = read(key).filter((x) => x.id !== v.id);
  list.unshift({ ...v, savedAt: Date.now() });
  write(key, list);

  remoteUpsert(key, v);
}

export function remove(key: StoreKey, id: string) {
  write(key, read(key).filter((v) => v.id !== id));
  remoteRemove(key, id);
}

export function toggle(key: StoreKey, v: VideoItem): boolean {
  if (has(key, v.id)) {
    remove(key, v.id);
    return false;
  }
  add(key, v);
  return true;
}

export function clear(key: StoreKey) {
  write(key, []);
  remoteClear(key);
}

/** Kéo dữ liệu từ server về sau khi đăng nhập, ghi đè cache cục bộ */
export async function pullFromServer(key: StoreKey): Promise<StoredVideo[]> {
  const items = (await remotePull(key)) as StoredVideo[];
  if (!items.length) return read(key);
  localStorage.setItem(KEYS[key], JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('youpe-store', { detail: key }));
  return items;
}

/** Đẩy dữ liệu đang có ở máy lên server — gọi ngay sau khi đăng nhập lần đầu */
export async function pushAllToServer() {
  for (const key of Object.keys(KEYS) as StoreKey[]) {
    await remotePushAll(key, read(key));
  }
}
