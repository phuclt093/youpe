'use client';

/**
 * Gọi trước `/api/streams` để lúc người dùng bấm vào thì server đã có sẵn kết quả
 * trong cache.
 *
 * Mỗi lần gọi làm server chạy yt-dlp nên phải giới hạn cẩn thận:
 *   - mỗi video chỉ gọi một lần cho tới khi tải lại trang
 *   - giới hạn số lời gọi chạy song song
 *   - rê chuột phải giữ đủ lâu mới tính là có ý định xem
 *
 * Trạng thái được phát ra ngoài để card video hiện chấm báo "đã sẵn sàng" —
 * không có phản hồi nhìn thấy được thì không ai biết nó có chạy hay không.
 */

export type PrefetchState = 'idle' | 'loading' | 'ready' | 'failed';

const state = new Map<string, PrefetchState>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const queue: string[] = [];
let running = 0;

const MAX_PARALLEL = 2;
const HOVER_DELAY = 250;
const RETRY_AFTER_FAIL_MS = 30_000;
const EVENT = 'youpe-prefetch';

function emit(id: string, s: PrefetchState) {
  state.set(id, s);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id, state: s } }));
}

export function getPrefetchState(id: string): PrefetchState {
  return state.get(id) ?? 'idle';
}

export function onPrefetchChange(fn: (id: string, s: PrefetchState) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent).detail;
    fn(d.id, d.state);
  };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const id = queue.shift()!;
    if (state.get(id) !== 'loading') continue;

    running++;
    fetch(`/api/streams/${id}`)
      .then((r) => {
        if (r.ok) {
          emit(id, 'ready');
        } else {
          emit(id, 'failed');
          // cho phép thử lại sau, biết đâu chỉ là trục trặc nhất thời
          setTimeout(() => state.delete(id), RETRY_AFTER_FAIL_MS);
        }
      })
      .catch(() => {
        emit(id, 'failed');
        setTimeout(() => state.delete(id), RETRY_AFTER_FAIL_MS);
      })
      .finally(() => {
        running--;
        pump();
      });
  }
}

function enqueue(id: string, front = false) {
  const s = state.get(id);
  if (s === 'loading' || s === 'ready' || s === 'failed') return;

  emit(id, 'loading');
  if (front) queue.unshift(id);
  else queue.push(id);
  pump();
}

/** Gọi ngay và ưu tiên — dùng khi người dùng đã nhấn chuột, chắc chắn muốn xem */
export function prefetchNow(id: string) {
  if (!id) return;
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  enqueue(id, true);
}

/** Hẹn giờ gọi — dùng khi mới rê chuột vào */
export function prefetchOnHover(id: string) {
  if (!id || state.has(id) || timers.has(id)) return;

  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      enqueue(id);
    }, HOVER_DELAY)
  );
}

/**
 * Nạp trước ngầm, không chờ người dùng làm gì.
 * Dùng cho vài card đầu của feed — lúc họ lướt tới thì đã sẵn sàng.
 */
export function prefetchIdle(id: string, delayMs = 1500) {
  if (!id || state.has(id) || timers.has(id)) return;

  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      enqueue(id);
    }, delayMs)
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
