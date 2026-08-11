'use client';

/**
 * Chọn đích cho các lời gọi liên quan tới **tài khoản và thư viện**.
 *
 * youpe chạy được ở hai chế độ, khác nhau đúng một biến:
 *
 *   Trực tiếp   địa chỉ trống  → gọi `/api/library` → server chạy ngay trên máy
 *               → server đó cầm token Turso
 *
 *   Từ xa       có địa chỉ     → gọi `https://.../api/library` → server của bạn
 *               → chỉ server đó cầm token; máy người dùng không biết token tồn tại
 *
 * **Chỉ tài khoản và thư viện đi xa.** Feed, tìm kiếm, và nhất là luồng video vẫn
 * do server trên máy lo. Đây là lựa chọn có chủ đích chứ không phải làm dở:
 *
 *   - Băng thông video là thứ đắt nhất. Cho nó đi qua server bạn thì tiền hosting
 *     tăng theo số người xem, còn để nguyên thì bạn chỉ chở vài KB dữ liệu thư viện.
 *   - yt-dlp vẫn chạy bằng IP nhà của từng người. Chuyển lên máy chủ là đổi sang IP
 *     datacenter — thứ YouTube chặn mạnh hơn hẳn (xem docs/CONTEXT.md mục 3.1).
 *
 * Đổi lại phải chấp nhận gọi xuyên origin: cookie phiên cần `SameSite=None; Secure`
 * nên **server từ xa bắt buộc chạy HTTPS**, và nó phải bật CORS cho origin của app
 * (biến `YOUPE_ALLOW_ORIGINS`, xem `src/middleware.ts`).
 */

const KEY = 'youpe.apiUrl';
const EVENT = 'youpe-api-url';

/** Bỏ dấu `/` thừa ở cuối để `base + '/api/...'` không thành `//api/...` */
const clean = (s: string) => s.trim().replace(/\/+$/, '');

/**
 * Địa chỉ server đồng bộ, chuỗi rỗng nghĩa là dùng server trên máy.
 *
 * Ưu tiên giá trị người dùng đặt trong Cài đặt, sau đó mới tới giá trị nhúng lúc
 * build. Nhờ vậy một bản cài phát cho nhiều người vẫn có sẵn địa chỉ mặc định,
 * mà ai muốn trỏ đi chỗ khác thì vẫn đổi được.
 */
export function apiBase(): string {
  if (typeof window === 'undefined') return '';
  try {
    return clean(localStorage.getItem(KEY) || process.env.NEXT_PUBLIC_YOUPE_API_URL || '');
  } catch {
    return '';
  }
}

export const isRemote = () => apiBase() !== '';

export function setApiBase(url: string) {
  const v = clean(url);
  if (v) localStorage.setItem(KEY, v);
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onApiBaseChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * `fetch` cho các endpoint tài khoản/thư viện.
 *
 * `credentials: 'include'` chỉ thêm khi đi xa. Cùng origin thì trình duyệt đã tự
 * gửi cookie rồi, mà đặt thừa lại làm một số cấu hình proxy khó chịu.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = apiBase();
  if (!base) return fetch(path, init);
  return fetch(base + path, { ...init, credentials: 'include' });
}

/**
 * Thử xem địa chỉ có phải một server youpe còn sống không.
 *
 * Gọi `/api/auth/me` vì nó nhẹ nhất và không cần đăng nhập — chưa đăng nhập thì
 * trả `{user: null}`, vẫn đủ để biết server có đó và CORS đã mở đúng.
 */
export async function pingApi(url: string): Promise<{ ok: boolean; message: string }> {
  const base = clean(url);
  if (!base) return { ok: false, message: 'Chưa nhập địa chỉ' };
  if (!/^https?:\/\//i.test(base)) return { ok: false, message: 'Địa chỉ phải bắt đầu bằng http:// hoặc https://' };

  try {
    const r = await fetch(`${base}/api/auth/me`, { credentials: 'include' });
    if (!r.ok) return { ok: false, message: `Server trả về HTTP ${r.status}` };
    await r.json();
    return { ok: true, message: 'Kết nối được' };
  } catch {
    /*
      Trình duyệt cố tình không cho biết vì sao một request xuyên origin hỏng —
      CORS bị chặn hay server không tồn tại đều ra cùng một lỗi rỗng. Nên chỉ có
      thể nêu cả hai khả năng.
    */
    return {
      ok: false,
      message: 'Không gọi được. Kiểm tra địa chỉ, HTTPS, và YOUPE_ALLOW_ORIGINS trên server.',
    };
  }
}
