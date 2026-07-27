'use client';

import { getPrefs } from './prefs';

/**
 * Xem trước khi rê chuột lên thumbnail.
 *
 * Lấy luồng hình có độ phân giải **thấp nhất** và phát không tiếng. Chọn thấp nhất
 * là cố ý: mỗi lần rê chuột là một lần tải dữ liệu thật, mà băng thông là chi phí
 * chính của dự án này. Xem trước chỉ cần thấy được nội dung, không cần nét.
 *
 * Mỗi lúc chỉ cho một video xem trước — rê sang card khác là cái cũ dừng ngay.
 */

const cache = new Map<string, string | null>();
let activeId: string | null = null;

/** Bỏ qua luồng quá nhỏ, mờ tới mức chẳng nhận ra gì */
const MIN_HEIGHT = 140;

export function previewEnabled(): boolean {
  return getPrefs().hoverPreview;
}

/**
 * Lấy URL để xem trước. Trả null nếu video này không có luồng phù hợp.
 * Kết quả được nhớ lại, rê chuột lần hai là dùng luôn.
 */
export async function getPreviewUrl(id: string): Promise<string | null> {
  if (cache.has(id)) return cache.get(id)!;

  try {
    const r = await fetch(`/api/streams/${id}`);
    if (!r.ok) {
      cache.set(id, null);
      return null;
    }

    const j = await r.json();

    // live thì không xem trước, luồng HLS không hợp cho việc này
    if (j.isLive) {
      cache.set(id, null);
      return null;
    }

    const pickLowest = (list: any[]) =>
      list
        .filter((f) => (f.height ?? 0) >= MIN_HEIGHT)
        .sort((a, b) => (a.height ?? 0) - (b.height ?? 0))[0] ??
      list[list.length - 1];

    // ưu tiên luồng chỉ có hình: không tiếng nên nhẹ hơn luồng gộp
    const chosen =
      (j.video?.length ? pickLowest(j.video) : null) ??
      (j.muxed?.length ? pickLowest(j.muxed) : null);

    const url = chosen?.url ?? null;
    cache.set(id, url);
    return url;
  } catch {
    cache.set(id, null);
    return null;
  }
}

export function claimPreview(id: string) {
  activeId = id;
}

export function isPreviewActive(id: string) {
  return activeId === id;
}

export function releasePreview(id: string) {
  if (activeId === id) activeId = null;
}
