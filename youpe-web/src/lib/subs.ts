'use client';

import { remoteClear, remotePull, remotePushAll, remoteRemove, remoteUpsert } from './sync';

/**
 * Kênh đã đăng ký — không liên quan gì tới tài khoản Google.
 *
 * Chưa đăng nhập thì nằm ở localStorage. Đã đăng nhập thì localStorage đóng vai
 * bộ nhớ đệm, đồng thời đẩy lên server — giống hệt lịch sử và xem sau.
 *
 * Trước đây phần này đứng ngoài cơ chế đồng bộ: đăng nhập ở máy khác là mất sạch
 * kênh đăng ký, dù lịch sử và xem sau vẫn về đủ. Chỉ vì `storage.ts` là nơi duy
 * nhất biết cách gọi API, mà kênh thì không phải video nên không nhét vào đó được.
 * Nay cách gọi tách ra `sync.ts` dùng chung.
 */

export type SubChannel = {
  id: string;
  name: string;
  avatar: string;
  subsText: string;
  addedAt: number;
};

const KEY = 'youpe.subs';
const EVENT = 'youpe-subs';

function read(): SubChannel[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function write(list: SubChannel[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 300)));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getSubs(): SubChannel[] {
  return read().sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function isSubscribed(channelId: string): boolean {
  return !!channelId && read().some((c) => c.id === channelId);
}

export function subscribe(c: Omit<SubChannel, 'addedAt'>) {
  if (!c.id) return;
  const row: SubChannel = { ...c, addedAt: Date.now() };
  write([...read().filter((x) => x.id !== c.id), row]);
  remoteUpsert('subs', row);
}

export function unsubscribe(channelId: string) {
  write(read().filter((c) => c.id !== channelId));
  remoteRemove('subs', channelId);
}

/** Bỏ hết — trang Cài đặt gọi khi người dùng bấm xoá */
export function clearSubs() {
  write([]);
  remoteClear('subs');
}

/** Kéo về sau khi đăng nhập, ghi đè bản ở máy */
export async function pullSubs(): Promise<SubChannel[]> {
  const items = await remotePull('subs');
  if (!items.length) return read();
  const list = items.map((i) => ({ ...(i as SubChannel) }));
  write(list);
  return list;
}

/** Đẩy những gì đang có ở máy lên — gọi ngay sau lần đăng nhập đầu */
export const pushSubs = () => remotePushAll('subs', read());

/** Trả về trạng thái mới sau khi bật/tắt */
export function toggleSub(c: Omit<SubChannel, 'addedAt'>): boolean {
  if (isSubscribed(c.id)) {
    unsubscribe(c.id);
    return false;
  }
  subscribe(c);
  return true;
}

export function onSubsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
