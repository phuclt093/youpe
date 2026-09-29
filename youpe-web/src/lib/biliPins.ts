'use client';

import { remotePull, remotePushAll, remoteRemove, remoteUpsert } from './sync';
import * as store from './storage';
import type { VideoItem } from './types';

/**
 * Phim Bilibili đã ghim.
 *
 * Ghim theo **cả bộ phim**, không theo từng tập: người xem ghim "Link Click: Mùa 3"
 * chứ không ai muốn ghim riêng tập 8. Khoá ghim vì thế là id của phần phim
 * (`bili_p_<season>`); video lẻ không thuộc bộ nào (`bili_v_<aid>`) thì ghim chính nó.
 *
 * Đồng bộ theo tài khoản như kênh đăng ký: chưa đăng nhập thì nằm ở localStorage,
 * đăng nhập rồi thì localStorage làm bộ nhớ đệm và mọi thay đổi đẩy lên server.
 */

export type BiliPin = {
  /** bili_p_<season> hoặc bili_v_<aid> */
  id: string;
  title: string;
  thumbnail: string;
  /** dòng phụ lúc ghim, ví dụ "Tập 24 Đã cập nhật" */
  sub: string;
  pinnedAt: number;
};

const KEY = 'youpe.biliPins';
const EVENT = 'youpe-bili-pins';
const MAX = 200;

/** Tập phim → id phần phim; video lẻ giữ nguyên; không phải Bilibili → '' */
export function pinKeyOf(videoId: string): string {
  if (videoId.startsWith('bili_p_')) {
    const season = videoId.slice(7).split('_')[0];
    return /^\d+$/.test(season) ? `bili_p_${season}` : '';
  }
  return videoId.startsWith('bili_v_') ? videoId : '';
}

function read(): BiliPin[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function write(list: BiliPin[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* hết chỗ — lần ghim này chỉ còn trên server nếu đã đăng nhập */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Mới ghim nằm trên cùng */
export function getPins(): BiliPin[] {
  return read().sort((a, b) => b.pinnedAt - a.pinnedAt);
}

export function isPinned(videoId: string): boolean {
  const k = pinKeyOf(videoId);
  return !!k && read().some((p) => p.id === k);
}

export function pin(v: { id: string; title: string; thumbnail: string; sub?: string }) {
  const id = pinKeyOf(v.id);
  if (!id) return;
  const row: BiliPin = {
    id,
    title: v.title,
    thumbnail: v.thumbnail,
    sub: v.sub ?? '',
    pinnedAt: Date.now(),
  };
  write([row, ...read().filter((p) => p.id !== id)]);
  remoteUpsert('bilipins', row);
}

export function unpin(videoId: string) {
  const id = pinKeyOf(videoId);
  if (!id) return;
  write(read().filter((p) => p.id !== id));
  remoteRemove('bilipins', id);
}

/** Trả về trạng thái mới sau khi bật/tắt */
export function togglePin(v: { id: string; title: string; thumbnail: string; sub?: string }): boolean {
  if (isPinned(v.id)) {
    unpin(v.id);
    return false;
  }
  pin(v);
  return true;
}

/**
 * Tập đang xem dở của một bộ đã ghim — lấy từ lịch sử xem.
 *
 * Bấm vào phim đã ghim mà lần nào cũng về tập 1 thì ghim cũng như không. Lịch sử
 * xếp mới nhất lên đầu, nên tập đầu tiên khớp bộ phim chính là tập vừa xem.
 */
export function resumeIdFor(pinId: string): string {
  if (!pinId.startsWith('bili_p_')) return pinId;
  const prefix = pinId + '_';
  return store.getList('history').find((v) => v.id.startsWith(prefix))?.id ?? pinId;
}

/** Đổi ghim thành thẻ video để hiện bằng VideoCard, trỏ thẳng tới tập xem dở */
export function pinToItem(p: BiliPin): VideoItem {
  const target = resumeIdFor(p.id);
  const resumed = target !== p.id;
  const ep = resumed ? store.getList('history').find((v) => v.id === target) : null;
  return {
    id: target,
    title: p.title,
    thumbnail: p.thumbnail,
    durationSec: null,
    durationText: '',
    viewsText: resumed && ep ? `Xem tiếp: ${ep.title}` : p.sub,
    publishedText: '',
    isLive: false,
    author: { id: '', name: '', avatar: '', verified: false },
  };
}

/** Kéo về sau khi đăng nhập, ghi đè bản ở máy */
export async function pullPins(): Promise<BiliPin[]> {
  const items = await remotePull('bilipins');
  if (!items.length) return read();
  const list = items.map((i) => ({ ...(i as BiliPin) }));
  write(list);
  return list;
}

/** Đẩy những gì đang có ở máy lên — gọi ngay sau lần đăng nhập đầu */
export const pushPins = () => remotePushAll('bilipins', read());

export function onPinsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
