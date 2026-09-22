'use client';

/** Tuỳ chọn của người dùng, lưu ở máy. Trình phát và trang chủ đều đọc từ đây. */

export type Prefs = {
  maxHeight: number;
  autoplayNext: boolean;
  forceH264: boolean;
  animations: boolean;
  /** Tiếp tục phát khi cửa sổ bị ẩn hoặc chuyển sang tab khác */
  playInBackground: boolean;
  /**
   * Rời trang xem thì thu nhỏ vào góc dưới phải của app (như YouTube) thay vì dừng hẳn.
   * Đây **không phải** cửa sổ nổi của hệ điều hành — cái đó chỉ mở khi tự bấm nút.
   */
  miniOnLeave: boolean;
  /** Rê chuột lên thumbnail thì phát thử một đoạn không tiếng */
  hoverPreview: boolean;
  /**
   * Đang xem ở cửa sổ nổi (PiP kiểu trình duyệt, dùng cho vỏ desktop) mà bấm sang
   * video khác thì video mới có tự mở lại trong cửa sổ nổi hay không. Tắt đi thì
   * video mới phát bình thường trên trang, cửa sổ nổi tự đóng.
   */
  keepPipOnVideoChange: boolean;
};

const DEFAULTS: Prefs = {
  maxHeight: 720,
  autoplayNext: true,
  forceH264: false,
  animations: true,
  playInBackground: true,
  miniOnLeave: true,
  hoverPreview: true,
  keepPipOnVideoChange: true,
};

const KEYS: Record<keyof Prefs, string> = {
  maxHeight: 'youpe.maxHeight',
  autoplayNext: 'youpe.autoplayNext',
  forceH264: 'youpe.forceH264',
  animations: 'youpe.animations',
  playInBackground: 'youpe.playInBackground',
  miniOnLeave: 'youpe.miniOnLeave',
  hoverPreview: 'youpe.hoverPreview',
  keepPipOnVideoChange: 'youpe.keepPipOnVideoChange',
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
    hoverPreview: bool(KEYS.hoverPreview, DEFAULTS.hoverPreview),
    keepPipOnVideoChange: bool(KEYS.keepPipOnVideoChange, DEFAULTS.keepPipOnVideoChange),
  };
}

/** Giá trị gốc, để trang Cài đặt biết cái nào đang khác mặc định */
export const PREF_DEFAULTS: Prefs = DEFAULTS;

/**
 * Xoá sạch tuỳ chọn đã lưu, `getPrefs()` sẽ tự rơi về mặc định.
 * Xoá key thay vì ghi đè giá trị mặc định, để sau này đổi mặc định thì
 * máy người dùng cũng nhận theo.
 */
export function resetPrefs() {
  for (const k of Object.values(KEYS)) localStorage.removeItem(k);
  window.dispatchEvent(new CustomEvent(EVENT));
  applyAnimations(DEFAULTS.animations);
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
