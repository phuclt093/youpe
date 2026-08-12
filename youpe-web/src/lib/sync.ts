'use client';

import { apiFetch } from './api';

/**
 * Lớp mỏng nói chuyện với `/api/library`.
 *
 * Bốn thứ cùng cần đồng bộ — lịch sử, xem sau, đã thích, kênh đăng ký, danh sách
 * phát — nhưng trước đây chỉ `storage.ts` biết đường gọi API, nên `subs.ts` và
 * `playlists.ts` đứng ngoài và dữ liệu chỉ nằm ở máy. Gom cách gọi vào một chỗ để
 * thêm loại mới chỉ là thêm một cái tên danh sách.
 *
 * **Ghi là bắn đi rồi quên.** Giao diện cập nhật ngay từ localStorage, lời gọi
 * mạng chạy nền và nuốt lỗi. Mất mạng thì thao tác vẫn mượt, chỉ là lần này chưa
 * lên được server — lần đăng nhập sau `pushAll` sẽ dọn nốt.
 */

/** Bảng `library` chỉ cần mỗi `id` để làm khoá; phần còn lại nhét nguyên vào payload */
export type Saved = { id: string } & Record<string, any>;

export type ListName = 'history' | 'later' | 'liked' | 'playlists' | 'subs';

let signedIn = false;
export const setSignedIn = (v: boolean) => {
  signedIn = v;
};
export const isSignedIn = () => signedIn;

const quiet = (p: Promise<any>) => {
  p.catch(() => {});
};

const json = { 'Content-Type': 'application/json' };

export function remoteUpsert(list: ListName, item: Saved) {
  if (!signedIn) return;
  quiet(apiFetch('/api/library', { method: 'POST', headers: json, body: JSON.stringify({ list, item }) }));
}

export function remoteRemove(list: ListName, id: string) {
  if (!signedIn) return;
  quiet(apiFetch(`/api/library?list=${list}&videoId=${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export function remoteClear(list: ListName) {
  if (!signedIn) return;
  quiet(apiFetch(`/api/library?list=${list}`, { method: 'DELETE' }));
}

/** Kéo về, trả mảng rỗng nếu hỏng — nơi gọi tự quyết định giữ bản ở máy hay không */
export async function remotePull(list: ListName): Promise<Saved[]> {
  if (!signedIn) return [];
  try {
    const r = await apiFetch(`/api/library?list=${list}`);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.items) ? j.items : [];
  } catch {
    return [];
  }
}

/**
 * Đẩy nguyên một danh sách lên, dùng ngay sau lần đăng nhập đầu.
 *
 * Gửi tuần tự chứ không `Promise.all`: đăng nhập lần đầu có thể có hàng trăm mục,
 * bắn cùng lúc là tự làm nghẽn chính mình, mà server thì ghi vào Turso qua mạng.
 */
export async function remotePushAll(list: ListName, items: Saved[]) {
  if (!signedIn) return;
  for (const item of items.slice(0, 300)) {
    await apiFetch('/api/library', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ list, item }),
    }).catch(() => {});
  }
}
