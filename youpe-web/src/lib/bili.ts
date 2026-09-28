/**
 * Bilibili.tv (bản quốc tế của Bilibili).
 *
 * Chỉ làm đúng một việc: đổi qua lại giữa đường dẫn bilibili.tv và id nội bộ của
 * app. Phần lấy luồng do yt-dlp lo (bộ trích xuất `BiliIntl` có sẵn trong bản
 * yt-dlp mà dự án đang dùng), nên ở đây không có logic mạng nào cả.
 *
 * Quy ước id, đặt tiền tố để mọi tầng phía sau biết đây không phải YouTube:
 *   bili_v_<aid>            ← /vi/video/<aid>          (video người dùng đăng)
 *   bili_p_<season>_<ep>    ← /vi/play/<season>/<ep>   (một tập phim / anime)
 *   bili_p_<season>         ← /vi/play/<season>        (tập đầu của phần đó)
 *
 * Lưu ý: nội dung trả phí hoặc khoá theo vùng sẽ không phát được, và app **không**
 * tìm cách mở khoá chúng — gặp thì yt-dlp báo lỗi và người xem thấy thông báo.
 */

/** Đường dẫn bilibili.tv → id nội bộ. Không phải bilibili.tv thì trả về ''. */
export function biliIdFromUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return '';
  }

  if (!/(^|\.)bilibili\.tv$/i.test(u.hostname)) return '';

  // bỏ mã ngôn ngữ ở đầu nếu có: /vi/play/... , /en/video/...
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0])) parts.shift();

  const [kind, a, b] = parts;
  const num = (s?: string) => (s && /^\d+$/.test(s) ? s : '');

  if (kind === 'video' && num(a)) return `bili_v_${a}`;
  if (kind === 'play' && num(a)) return num(b) ? `bili_p_${a}_${b}` : `bili_p_${a}`;

  return '';
}

/** id nội bộ → đường dẫn bilibili.tv để yt-dlp trích xuất */
export function biliUrlFromId(id: string, lang = 'vi'): string {
  if (id.startsWith('bili_v_')) return `https://www.bilibili.tv/${lang}/video/${id.slice(7)}`;
  if (id.startsWith('bili_p_')) {
    const [season, ep] = id.slice(7).split('_');
    return ep
      ? `https://www.bilibili.tv/${lang}/play/${season}/${ep}`
      : `https://www.bilibili.tv/${lang}/play/${season}`;
  }
  return '';
}

export const isBiliId = (id: string) => id.startsWith('bili_');
