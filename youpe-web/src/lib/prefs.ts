'use client';

/** Tuỳ chọn của người dùng, lưu ở máy. Trình phát và trang chủ đều đọc từ đây. */

export type Prefs = {
  maxHeight: number;
  autoplayNext: boolean;
  forceH264: boolean;
  animations: boolean;
  /** Tiếp tục phát khi cửa sổ bị ẩn hoặc chuyển sang tab khác */
  playInBackground: boolean;
  /** Rời trang xem thì thu nhỏ thành cửa sổ con thay vì dừng hẳn */
  miniOnLeave: boolean;
};

const DEFAULTS: Prefs = {
  maxHeight: 720,
  autoplayNext: true,
  forceH264: false,
  animations: true,
  playInBackground: true,
  miniOnLeave: true,
};

const KEYS: Record<keyof Prefs, string> = {
  maxHeight: 'youpe.maxHeight',
  autoplayNext: 'youpe.autoplayNext',
  forceH264: 'youpe.forceH264',
  animations: 'youpe.animations',
  playInBackground: 'youpe.playInBackground',
  miniOnLeave: 'youpe.miniOnLeave',
};

const EVENT = 'youpe-prefs';

export function getPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULTS;
  const num = (k: string, d: number) => {
    const v = Number(localStorage.getItem(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  const bool = (k: string, d: boolean) => {
    const v = localStorage.getItem(k);
    return v === null ? d : v === '1';
  };

  return {
    maxHeight: num(KEYS.maxHeight, DEFAULTS.maxHeight),
    autoplayNext: bool(KEYS.autoplayNext, DEFAULTS.autoplayNext),
    forceH264: bool(KEYS.forceH264, DEFAULTS.forceH264),
    animations: bool(KEYS.animations, DEFAULTS.animations),
    playInBackground: bool(KEYS.playInBackground, DEFAULTS.playInBackground),
    miniOnLeave: bool(KEYS.miniOnLeave, DEFAULTS.miniOnLeave),
  };
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  const raw = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
  localStorage.setItem(KEYS[key], raw);
  window.dispatchEvent(new CustomEvent(EVENT));
  if (key === 'animations') applyAnimations(value as boolean);
}

export function onPrefsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/** Tắt hiệu ứng bằng một class trên thẻ html, CSS lo phần còn lại */
export function applyAnimations(on: boolean) {
  document.documentElement.classList.toggle('no-anim', !on);
}
