'use client';

/**
 * Tiến độ xem của từng video.
 *
 * Dùng cho hai việc: mở lại video thì tiếp tục đúng chỗ, và vẽ vạch đỏ dưới
 * thumbnail để nhìn lướt là biết đã xem tới đâu.
 */

export type Progress = { t: number; d: number; at: number };

const KEY = 'youpe.progress';
const EVENT = 'youpe-progress';

/** Giữ tối đa bấy nhiêu video, xoá dần cái cũ nhất */
const MAX = 800;
/** Xem chưa tới mức này thì coi như chưa bắt đầu, đừng làm phiền */
const MIN_SECONDS = 10;
/** Còn ít hơn ngần này ở cuối thì coi như đã xem xong */
const END_MARGIN = 20;

type Store = Record<string, Progress>;

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function write(s: Store) {
  const keys = Object.keys(s);
  if (keys.length > MAX) {
    // bỏ những mục cũ nhất
    const sorted = keys.sort((a, b) => s[a].at - s[b].at);
    for (const k of sorted.slice(0, keys.length - MAX)) delete s[k];
  }

  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getProgress(videoId: string): Progress | null {
  return read()[videoId] ?? null;
}

export function getAllProgress(): Store {
  return read();
}

export function saveProgress(videoId: string, t: number, d: number) {
  if (!videoId || !Number.isFinite(t) || !Number.isFinite(d) || d <= 0) return;

  const s = read();

  // xem xong rồi thì bỏ mục đó đi, lần sau mở lại là từ đầu
  if (t >= d - END_MARGIN) {
    if (s[videoId]) {
      delete s[videoId];
      write(s);
    }
    return;
  }

  if (t < MIN_SECONDS) return;

  s[videoId] = { t, d, at: Date.now() };
  write(s);
}

export function clearProgress(videoId?: string) {
  if (!videoId) {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVENT));
    return;
  }
  const s = read();
  delete s[videoId];
  write(s);
}

/** Tỉ lệ đã xem, 0–1. Trả 0 nếu chưa có gì đáng kể. */
export function progressRatio(videoId: string): number {
  const p = getProgress(videoId);
  if (!p || p.d <= 0) return 0;
  return Math.min(1, Math.max(0, p.t / p.d));
}

/** Vị trí nên tiếp tục, hoặc 0 nếu không đáng hỏi */
export function resumeAt(videoId: string): number {
  const p = getProgress(videoId);
  if (!p) return 0;
  if (p.t < MIN_SECONDS || p.t >= p.d - END_MARGIN) return 0;
  return p.t;
}

export function onProgressChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
