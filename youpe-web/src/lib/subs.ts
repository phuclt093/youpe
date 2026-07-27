'use client';

/**
 * Kênh đã đăng ký — lưu ở máy, không liên quan tới tài khoản Google.
 *
 * Trước đây nút "Đăng ký" chỉ đổi màu rồi mất khi tải lại trang. Giờ nó lưu thật,
 * và trang /subscriptions gom video mới của các kênh đó lại.
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
  const list = read().filter((x) => x.id !== c.id);
  list.push({ ...c, addedAt: Date.now() });
  write(list);
}

export function unsubscribe(channelId: string) {
  write(read().filter((c) => c.id !== channelId));
}

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
