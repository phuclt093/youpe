'use client';

/**
 * Gọi trước /api/streams để lúc người dùng bấm vào thì server đã có sẵn kết quả
 * trong cache. Mỗi lần gọi làm server chạy yt-dlp nên phải giới hạn cẩn thận:
 *   - mỗi video chỉ gọi một lần cho tới khi tải lại trang
 *   - tối đa 2 lời gọi chạy song song
 *   - rê chuột phải giữ đủ lâu mới tính là có ý định xem
 */

const done = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let running = 0;

const MAX_PARALLEL = 2;
const RETRY_AFTER_FAIL_MS = 30_000;
const HOVER_DELAY = 400;

function fire(id: string) {
  if (done.has(id) || running >= MAX_PARALLEL) return;
  done.add(id);
  running++;
  fetch(`/api/streams/${id}`)
    .then((r) => {
      // hỏng thì cho phép thử lại sau, đừng đánh dấu xong vĩnh viễn
      if (!r.ok) setTimeout(() => done.delete(id), RETRY_AFTER_FAIL_MS);
    })
    .catch(() => done.delete(id))
    .finally(() => {
      running--;
    });
}

/** Gọi ngay — dùng khi người dùng đã nhấn chuột, chắc chắn muốn xem */
export function prefetchNow(id: string) {
  if (!id) return;
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  fire(id);
}

/** Hẹn giờ gọi — dùng khi mới rê chuột vào */
export function prefetchOnHover(id: string) {
  if (!id || done.has(id) || timers.has(id)) return;
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      fire(id);
    }, HOVER_DELAY)
  );
}

/** Rê chuột ra trước khi hết giờ thì huỷ */
export function cancelPrefetch(id: string) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}
