'use client';

import { getPrefs } from './prefs';
import { getPrefetchData } from './prefetch';

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

/**
 * Chỉ tải phần đầu file, tính bằng byte.
 *
 * Hai lý do, lý do thứ hai mới là lý do chính:
 *
 * 1. Đoạn xem trước chỉ cần vài chục giây đầu. 3 MB ở mức 144–240p là thừa sức.
 * 2. googlevideo **bóp băng thông** những lời gọi luồng adaptive không kèm `Range`.
 *    Không chặn đầu thì trình duyệt mở một lời gọi kéo dài vô tận từ byte 0, bị bóp
 *    xuống vài chục KB/s — đó là lý do đoạn xem trước lâu hiện. Có `Range` thì
 *    YouTube trả về ngay ở tốc độ đầy đủ.
 *
 * Proxy còn khai báo lại độ dài file đúng bằng chỗ đã cắt, nên trình duyệt tưởng
 * file chỉ có ngần ấy: phát hết là `loop` quay lại từ đầu, không đâm vào lỗi 416.
 */
const CAP_BYTES = 3 * 1024 * 1024;

/** Gắn mức chặn vào đường dẫn đi qua proxy. Đường dẫn khác thì để nguyên. */
function capped(url: string): string {
  return url.includes('/api/stream?') ? `${url}&cap=${CAP_BYTES}` : url;
}

export function previewEnabled(): boolean {
  return getPrefs().hoverPreview;
}

/** Chọn luồng nhẹ nhất mà vẫn nhìn ra nội dung */
function pickUrl(j: any): string | null {
  // live thì không xem trước, luồng HLS không hợp cho việc này
  if (!j || j.isLive) return null;

  const pickLowest = (list: any[]) =>
    list
      .filter((f) => (f.height ?? 0) >= MIN_HEIGHT)
      .sort((a, b) => (a.height ?? 0) - (b.height ?? 0))[0] ?? list[list.length - 1];

  // ưu tiên luồng chỉ có hình: không tiếng nên nhẹ hơn luồng gộp
  const chosen =
    (j.video?.length ? pickLowest(j.video) : null) ??
    (j.muxed?.length ? pickLowest(j.muxed) : null);

  return chosen?.url ? capped(chosen.url) : null;
}

/**
 * Lấy URL để xem trước. Trả null nếu video này không có luồng phù hợp.
 * Kết quả được nhớ lại, rê chuột lần hai là dùng luôn.
 */
export async function getPreviewUrl(id: string): Promise<string | null> {
  if (cache.has(id)) return cache.get(id)!;

  // Việc nạp trước đã tải đúng dữ liệu này rồi thì dùng luôn, khỏi đi mạng lần nữa.
  const warm = getPrefetchData(id);
  if (warm) {
    const url = pickUrl(warm);
    cache.set(id, url);
    return url;
  }

  try {
    const r = await fetch(`/api/streams/${id}`);
    if (!r.ok) {
      cache.set(id, null);
      return null;
    }

    const url = pickUrl(await r.json());
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
