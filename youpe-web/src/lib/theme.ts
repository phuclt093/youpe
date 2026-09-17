/**
 * Chủ đề màu — chỉ còn MỘT bộ: cổ phong sáng.
 *
 * Trước 17/09/2026 app có sáu bộ dựng sẵn (tối, giấy cũ, mực đêm, Hoa linh,
 * Genshin…) cùng trình tự tạo bộ màu. Nay gom về một phong cách duy nhất cho
 * giao diện nhất quán: nền giấy tuyên sáng, chữ mực nâu, nhấn bằng son, liên kết
 * màu ngọc. Không còn gradient, không còn quầng sáng.
 *
 * Giao diện vẫn lấy màu từ biến CSS trên thẻ `html` (giá trị gốc ở `globals.css`,
 * khai báo cho Tailwind ở `tailwind.config.ts`). File này giữ lại `applyTheme`
 * làm lưới an toàn và để cửa sổ nổi / trò chơi đọc được bảng màu.
 *
 * File này **không** đánh dấu 'use client': layout (chạy trên server) có import.
 */

export const COLOR_KEYS = [
  'bg', 'bg2', 'elev', 'hover', 'chip', 'chip2', 'border', 'text', 'sub', 'red', 'blue', 'off',
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];
export type Palette = Record<ColorKey, string>;

export type Theme = {
  id: string;
  name: string;
  scheme: 'dark' | 'light';
  serif: boolean;
  colors: Palette;
};

/*
  Giữ đồng bộ với khối `:root` trong globals.css — hai chỗ phải cùng giá trị.

  Chữ không dùng đen tuyền: mực trên giấy luôn ngả nâu, #000 trông như bản in
  laser. Nền cũng không trắng tinh mà ngả ngà, đỡ chói khi xem lâu.
*/
export const THEME: Theme = {
  id: 'co-phong',
  name: 'Cổ phong',
  scheme: 'light',
  serif: true,
  colors: {
    bg: '#faf7f0', bg2: '#f3eee3', elev: '#efe9dc', hover: '#e6dfcf',
    chip: '#ece5d6', chip2: '#ddd3bf', border: '#dcd2bf',
    text: '#2a241d', sub: '#766a5a', red: '#a93a2e', blue: '#2f6b5a', off: '#bdb3a1',
  },
};

/** Giữ tên cũ cho các chỗ còn gọi */
export const PRESETS: Theme[] = [THEME];

const EVENT = 'youpe-theme';

/** "#f4ecd8" -> "244 236 216". Mã hỏng thì trả về đen, đừng ném lỗi giữa lúc vẽ. */
export function hexToChannels(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '0 0 0';
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function getActiveTheme(): Theme {
  return THEME;
}

/** Gán bảng màu lên thẻ `html`. Mọi thứ khác trong app tự ăn theo. */
export function applyTheme(t: Theme = THEME) {
  const root = document.documentElement;
  for (const k of COLOR_KEYS) root.style.setProperty(`--yt-${k}`, hexToChannels(t.colors[k]));
  root.style.colorScheme = t.scheme;
  root.dataset.theme = t.id;
  if (t.serif) root.dataset.serif = '1';
  else delete root.dataset.serif;
}

export function onThemeChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * Chạy trước lần vẽ đầu. Màu đã nằm sẵn trong globals.css nên không còn nháy màu;
 * script chỉ dọn khoá của hệ chủ đề cũ để localStorage khỏi giữ rác.
 */
export function themeBootScript(): string {
  return `(function(){try{localStorage.removeItem('youpe.theme');localStorage.removeItem('youpe.themesV1');}catch(e){}
var r=document.documentElement;r.dataset.theme='${THEME.id}';r.dataset.serif='1';})();`;
}
