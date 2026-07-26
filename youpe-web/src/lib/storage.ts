'use client';

import type { VideoItem } from './types';

export type StoredVideo = VideoItem & { savedAt: number };

const KEYS = {
  history: 'youpe.history',
  later: 'youpe.later',
  liked: 'youpe.liked',
  playlists: 'youpe.playlists',
} as const;

export type StoreKey = keyof typeof KEYS;

/**
 * Chưa đăng nhập  -> localStorage.
 * Đã đăng nhập    -> localStorage đóng vai cache, đồng thời ghi lên server.
 * Nhờ vậy giao diện phản hồi tức thì, không phải chờ mạng.
 */
let signedIn = false;
export function setSignedIn(v: boolean) {
  signedIn = v;
}

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

const quiet = (p: Promise<any>) => p.catch(() => {});

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

  if (signedIn)
    quiet(
      fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: key, video: v }),
      })
    );
}

export function remove(key: StoreKey, id: string) {
  write(key, read(key).filter((v) => v.id !== id));
  if (signedIn)
    quiet(fetch(`/api/library?list=${key}&videoId=${encodeURIComponent(id)}`, { method: 'DELETE' }));
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
  if (signedIn) quiet(fetch(`/api/library?list=${key}`, { method: 'DELETE' }));
}

/** Kéo dữ liệu từ server về sau khi đăng nhập, ghi đè cache cục bộ */
export async function pullFromServer(key: StoreKey): Promise<StoredVideo[]> {
  try {
    const r = await fetch(`/api/library?list=${key}`);
    if (!r.ok) return read(key);
    const j = await r.json();
    const items: StoredVideo[] = j.items ?? [];
    localStorage.setItem(KEYS[key], JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('youpe-store', { detail: key }));
    return items;
  } catch {
    return read(key);
  }
}

/** Đẩy dữ liệu đang có ở máy lên server — gọi ngay sau khi đăng nhập lần đầu */
export async function pushAllToServer() {
  for (const key of Object.keys(KEYS) as StoreKey[]) {
    for (const v of read(key).slice(0, 200)) {
      await quiet(
        fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ list: key, video: v }),
        })
      );
    }
  }
}
