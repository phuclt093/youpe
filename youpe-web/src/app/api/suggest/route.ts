import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Gợi ý khi gõ tìm kiếm.
 *
 * Không dùng `yt.getSearchSuggestions()` của youtubei.js: hàm đó gọi
 * `/complete/search` rồi đọc bằng `response.text()`. Theo chuẩn fetch, hàm này
 * **luôn giải mã bằng UTF-8** bất kể charset khai báo trong header — mà endpoint
 * gợi ý của Google lại trả về bảng mã cũ.
 *
 * Kiểu vỡ rất dễ bị nhầm là lỗi font: `ô` `è` `ọ` hỏng nhưng `ơ` `ế` `ỷ` vẫn đúng.
 * Lý do là ký tự nào có trong bảng mã cũ thì được gửi bằng 1 byte — thành byte không
 * hợp lệ trong UTF-8; còn ký tự không có trong bảng đó thì buộc phải gửi bằng UTF-8
 * nên đọc ra vẫn đúng.
 *
 * Cách xử lý: tải về dạng byte, thử giải mã bằng vài bảng mã, chọn bản ít lỗi nhất.
 */

const REPLACEMENT = '�';

/** Thứ tự thử: UTF-8 trước, rồi tới các bảng mã cũ hay gặp với tiếng Việt */
const ENCODINGS = ['utf-8', 'windows-1258', 'windows-1252', 'latin1'];

function countBad(s: string): number {
  let n = 0;
  for (const ch of s) if (ch === REPLACEMENT) n++;
  return n;
}

/** Giải mã bằng nhiều bảng mã rồi chọn bản sạch nhất */
function decodeBest(buf: ArrayBuffer, declared?: string | null): string {
  const order = declared ? [declared, ...ENCODINGS] : ENCODINGS;

  let best = '';
  let bestBad = Infinity;

  for (const enc of order) {
    let text: string;
    try {
      text = new TextDecoder(enc).decode(buf);
    } catch {
      continue; // bảng mã không được hỗ trợ
    }

    const bad = countBad(text);
    if (bad === 0) return text; // sạch hoàn toàn thì dùng luôn
    if (bad < bestBad) {
      bestBad = bad;
      best = text;
    }
  }

  return best;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ suggestions: [] });

  const hl = process.env.YT_LANG || 'vi';
  const gl = process.env.YT_REGION || 'VN';

  const url = new URL('https://suggestqueries-clients6.youtube.com/complete/search');
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('ds', 'yt');
  url.searchParams.set('hl', hl);
  url.searchParams.set('gl', gl);
  url.searchParams.set('oe', 'utf-8');
  url.searchParams.set('ie', 'utf-8');
  url.searchParams.set('q', q);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        'Accept-Charset': 'utf-8',
        'Accept-Language': `${hl},vi;q=0.9,en;q=0.8`,
      },
    });
    if (!res.ok) return NextResponse.json({ suggestions: [] });

    const declared = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1];
    const text = decodeBest(await res.arrayBuffer(), declared);

    // endpoint đôi khi bọc JSON trong một lời gọi hàm
    const clean = text.replace(/^[^[{]*\(/, '').replace(/\)\s*;?\s*$/, '');

    let data: unknown;
    try {
      data = JSON.parse(clean);
    } catch {
      return NextResponse.json({ suggestions: [] });
    }

    const list = Array.isArray(data) ? (data as unknown[])[1] : [];

    const suggestions = (Array.isArray(list) ? list : [])
      .map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? String(x[0] ?? '') : ''))
      .map((x) => x.trim())
      .filter(Boolean)
      // dòng nào vẫn còn ký tự lỗi thì bỏ hẳn — thà thiếu còn hơn hiện chữ vỡ
      .filter((x) => !x.includes(REPLACEMENT))
      .slice(0, 10);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
