/**
 * Chủ đề màu.
 *
 * Toàn bộ giao diện lấy màu từ một nhúm biến CSS trên thẻ `html` (khai báo mặc định
 * ở `globals.css`, khai báo cho Tailwind ở `tailwind.config.ts`). Đổi chủ đề chỉ là
 * gán lại mấy biến đó — không nạp thêm stylesheet, không dựng lại cây DOM, nên
 * chuyển tức thì kể cả khi video đang chạy.
 *
 * File này **không** đánh dấu 'use client': trang layout (chạy trên server) cần đọc
 * `PRESETS` để nhúng vào đoạn script chống nháy màu.
 */

export const COLOR_KEYS = [
  'bg', 'bg2', 'elev', 'hover', 'chip', 'chip2', 'border', 'text', 'sub', 'red', 'blue', 'off',
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];
export type Palette = Record<ColorKey, string>;

export type Theme = {
  id: string;
  name: string;
  /** Cho trình duyệt biết để vẽ thanh cuộn, ô nhập, menu hệ thống cho đúng */
  scheme: 'dark' | 'light';
  /** Dùng chữ có chân — cổ phong bật, mặc định tắt */
  serif: boolean;
  colors: Palette;
};

/** Nhãn tiếng Việt cho từng biến màu, dùng trong trang Cài đặt */
export const COLOR_LABELS: Record<ColorKey, string> = {
  bg: 'Nền trang',
  bg2: 'Nền chìm (ô tìm kiếm)',
  elev: 'Nền thẻ',
  hover: 'Nền khi rê chuột',
  chip: 'Nền nút tròn',
  chip2: 'Nút tròn khi rê chuột',
  border: 'Đường viền',
  text: 'Chữ chính',
  sub: 'Chữ phụ',
  red: 'Màu nhấn',
  blue: 'Màu liên kết',
  off: 'Công tắc lúc tắt',
};

/* ------------------------------------------------------------------ */

export const PRESETS: Theme[] = [
  {
    id: 'mac-dinh',
    name: 'Mặc định',
    scheme: 'dark',
    serif: false,
    colors: {
      bg: '#0f0f0f', bg2: '#121212', elev: '#212121', hover: '#272727',
      chip: '#272727', chip2: '#3f3f3f', border: '#303030',
      text: '#f1f1f1', sub: '#aaaaaa', red: '#ff0033', blue: '#3ea6ff', off: '#5a5a5a',
    },
  },
  {
    /*
      Giấy dó ngả vàng, mực nho, ấn son. Chữ cố ý không dùng đen tuyền — mực trên
      giấy cũ luôn ngả nâu, để #000 thì trông như trang web in laser chứ không ra
      sách cổ.
    */
    id: 'co-phong-giay',
    name: 'Cổ phong · Giấy cũ',
    scheme: 'light',
    serif: true,
    colors: {
      bg: '#f4ecd8', bg2: '#efe4cb', elev: '#eae0c6', hover: '#ded0ab',
      chip: '#e4d7b8', chip2: '#d2bf96', border: '#cbb894',
      text: '#2e2318', sub: '#7b6a51', red: '#a8322c', blue: '#3f6f5e', off: '#bba98a',
    },
  },
  {
    /*
      Mực đêm: nền đen ngả nâu như nghiên mực, chữ trắng ngà, nhấn bằng son và kim.
      Màu "liên kết" ở đây là vàng kim chứ không phải xanh dương — xanh dương trên
      nền này lạc quẻ ngay.
    */
    id: 'co-phong-muc',
    name: 'Cổ phong · Mực đêm',
    scheme: 'dark',
    serif: true,
    colors: {
      bg: '#14110c', bg2: '#191510', elev: '#221d15', hover: '#2e2719',
      chip: '#2a2318', chip2: '#3d3423', border: '#3a3225',
      text: '#ece2ce', sub: '#a49075', red: '#c8452f', blue: '#c9a227', off: '#544938',
    },
  },
  {
    /*
      Cổ phong pha Hoa Linh Lục Địa: vẫn là đêm phương Đông, nhưng đổi nghiên mực
      lấy trời chàm, và thay son bằng hai màu đặc trưng của lễ hội linh hồn —
      hồng hoa anh linh làm màu nhấn, lửa linh xanh ngọc làm màu liên kết.

      Nền cố ý ngả tím chứ không đen tuyền: đen tuyền thì hồng và ngọc nổi đến mức
      chói, còn nền chàm kéo cả ba về cùng một tông đêm.
    */
    id: 'co-phong-hoa-linh',
    name: 'Cổ phong · Hoa linh',
    scheme: 'dark',
    serif: true,
    colors: {
      bg: '#0d0a18', bg2: '#120e21', elev: '#1a1430', hover: '#251d42',
      chip: '#221a3c', chip2: '#342a5c', border: '#33285a',
      text: '#f2eaff', sub: '#a294c8', red: '#ff5ea8', blue: '#5fe0d2', off: '#463a70',
    },
  },
];

/* ------------------------------------------------------------------ */

const ACTIVE_KEY = 'youpe.theme';
const CUSTOM_KEY = 'youpe.themesV1';
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

/** Đọc các bộ màu người dùng tự tạo */
export function getCustomThemes(): Theme[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(isTheme) : [];
  } catch {
    return [];
  }
}

function isTheme(t: any): t is Theme {
  return !!t && typeof t.id === 'string' && !!t.colors && COLOR_KEYS.every((k) => t.colors[k]);
}

function writeCustom(list: Theme[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
}

export function getAllThemes(): Theme[] {
  return [...PRESETS, ...getCustomThemes()];
}

export function getActiveId(): string {
  if (typeof window === 'undefined') return PRESETS[0].id;
  return localStorage.getItem(ACTIVE_KEY) || PRESETS[0].id;
}

export function getActiveTheme(): Theme {
  const id = getActiveId();
  return getAllThemes().find((t) => t.id === id) ?? PRESETS[0];
}

/* ------------------------------------------------------------------ */

/** Gán bảng màu lên thẻ `html`. Mọi thứ khác trong app tự ăn theo. */
export function applyTheme(t: Theme) {
  const root = document.documentElement;
  for (const k of COLOR_KEYS) root.style.setProperty(`--yt-${k}`, hexToChannels(t.colors[k]));
  root.style.colorScheme = t.scheme;
  root.dataset.theme = t.id;
  if (t.serif) root.dataset.serif = '1';
  else delete root.dataset.serif;
}

export function setActiveTheme(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
  applyTheme(getAllThemes().find((t) => t.id === id) ?? PRESETS[0]);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Tạo một bộ mới bằng cách chép bộ đang dùng.
 * Bắt đầu từ con số không thì phải ngồi chọn 12 màu mới xem được gì; chép rồi
 * sửa dần thì lúc nào giao diện cũng còn dùng được.
 */
export function duplicateTheme(source: Theme, name?: string): Theme {
  const copy: Theme = {
    id: `tuy-chinh-${Date.now().toString(36)}`,
    name: name || `${source.name} (bản sao)`,
    scheme: source.scheme,
    serif: source.serif,
    colors: { ...source.colors },
  };
  writeCustom([...getCustomThemes(), copy]);
  return copy;
}

/** Sửa từng phần — `colors` chỉ cần đưa vài màu, không phải cả bảng */
export type ThemePatch = Partial<Omit<Theme, 'id' | 'colors'>> & { colors?: Partial<Palette> };

export function updateTheme(id: string, patch: ThemePatch) {
  const list = getCustomThemes();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return; // preset thì không sửa được, phải nhân bản trước

  list[i] = { ...list[i], ...patch, colors: { ...list[i].colors, ...(patch.colors ?? {}) } };
  writeCustom(list);

  if (getActiveId() === id) applyTheme(list[i]);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function deleteTheme(id: string) {
  writeCustom(getCustomThemes().filter((t) => t.id !== id));
  // đang dùng bộ vừa xoá thì rơi về mặc định, không để giao diện trống màu
  if (getActiveId() === id) setActiveTheme(PRESETS[0].id);
  else window.dispatchEvent(new CustomEvent(EVENT));
}

export function isPreset(id: string): boolean {
  return PRESETS.some((t) => t.id === id);
}

export function onThemeChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/* ------------------------------------------------------------------ */

/**
 * Đoạn script chạy **trước khi trang vẽ lần đầu**, nhúng thẳng vào `<head>`.
 *
 * Không có nó thì trang luôn hiện ra bằng màu mặc định rồi mới nhảy sang chủ đề đã
 * chọn — với chủ đề sáng đó là một cú loé trắng vào mặt. React thì phải chờ tải
 * xong JavaScript mới chạy được, quá muộn.
 *
 * Các bộ dựng sẵn được nhúng luôn vào script để không phải chờ thêm gì.
 */
export function themeBootScript(): string {
  const presets = JSON.stringify(
    Object.fromEntries(
      PRESETS.map((t) => [
        t.id,
        {
          s: t.scheme,
          f: t.serif ? 1 : 0,
          c: Object.fromEntries(COLOR_KEYS.map((k) => [k, hexToChannels(t.colors[k])])),
        },
      ])
    )
  );

  return `(function(){try{
var P=${presets},K=${JSON.stringify(COLOR_KEYS)};
var id=localStorage.getItem('${ACTIVE_KEY}')||'${PRESETS[0].id}';
var t=P[id];
if(!t){var L=JSON.parse(localStorage.getItem('${CUSTOM_KEY}')||'[]');
 for(var i=0;i<L.length;i++){if(L[i]&&L[i].id===id){
  var c={};for(var j=0;j<K.length;j++){var h=String(L[i].colors[K[j]]||'').replace('#','');
   if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
   var n=parseInt(h,16)||0;c[K[j]]=((n>>16)&255)+' '+((n>>8)&255)+' '+(n&255);}
  t={s:L[i].scheme,f:L[i].serif?1:0,c:c};break;}}}
if(!t)return;
var r=document.documentElement;
for(var k=0;k<K.length;k++)r.style.setProperty('--yt-'+K[k],t.c[K[k]]);
r.style.colorScheme=t.s;r.dataset.theme=id;if(t.f)r.dataset.serif='1';
}catch(e){}})();`;
}
