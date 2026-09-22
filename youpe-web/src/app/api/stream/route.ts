import { NextRequest, NextResponse } from 'next/server';
import { allowedProxyHosts } from '@/lib/piped';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Host của YouTube + CDN mà Piped/Invidious trả về */
const ALLOWED_PATTERNS = [
  /(^|\.)googlevideo\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)ytimg\.com$/i,
  /(^|\.)ggpht\.com$/i,
  /(^|\.)google\.com$/i,
  /^youtu\.be$/i,
  // proxy do chính instance Piped/Invidious dựng
  /(^|\.)piped\.[a-z.]+$/i,
  /^piped/i,
  /^pipedproxy/i,
  /(^|\.)invidious\.[a-z.]+$/i,
];

function isAllowed(hostname: string): boolean {
  if (ALLOWED_PATTERNS.some((re) => re.test(hostname))) return true;
  // host của các instance cấu hình trong .env
  return allowedProxyHosts().some(
    (h) => hostname === h || hostname.endsWith('.' + h.replace(/^[^.]+\./, ''))
  );
}

/**
 * Header được phép nhận từ `&h=`.
 *
 * Danh sách trắng chứ không nhận bừa: `&h=` nằm trong URL nên bất cứ thứ gì trong
 * trang cũng dựng được, không lọc thì thành chỗ để bơm header tuỳ ý (Authorization,
 * X-Forwarded-For…) vào request đi ra ngoài.
 */
const ALLOWED_FORWARD_HEADERS = new Set([
  'user-agent',
  'referer',
  'origin',
  'cookie',
  'accept-language',
  'x-goog-visitor-id',
  'sec-fetch-mode',
]);

/** Bộ header của một trình duyệt bình thường — đúng cho URL lấy từ InnerTube/Piped */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  Origin: 'https://www.youtube.com',
  Referer: 'https://www.youtube.com/',
};

/** Giải mã bộ header do /api/streams gói vào `&h=` (base64url của JSON) */
function unpackHeaders(packed: string | null): Record<string, string> | null {
  if (!packed) return null;
  try {
    const json = Buffer.from(packed, 'base64url').toString('utf-8');
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;

    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && ALLOWED_FORWARD_HEADERS.has(k.toLowerCase())) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('u');
  if (!raw) return new NextResponse('missing u', { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse('bad url', { status: 400 });
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return new NextResponse('bad protocol', { status: 400 });
  }
  if (!isAllowed(target.hostname)) {
    return new NextResponse(`host không được phép: ${target.hostname}`, { status: 403 });
  }

  /**
   * Header gửi lên googlevideo.
   *
   * Mặc định là bộ của trình duyệt — đúng cho URL lấy từ InnerTube/Piped. Nhưng
   * yt-dlp tự chọn player client, và googlevideo **ràng mỗi URL với đúng client
   * đã sinh ra nó**: URL do client `ios` tạo mà gọi kèm User-Agent Chrome thì bị
   * trả 403, thẻ <video> nhận về trang lỗi rồi báo "Format error" — nhìn y hệt
   * lỗi codec nên rất dễ lần nhầm hướng.
   *
   * Nên khi `&h=` có mặt (do /api/streams gói bộ `http_headers` mà yt-dlp trả về),
   * bộ đó **thay thế hoàn toàn** mặc định — trộn lẫn còn tệ hơn, vì Origin/Referer
   * của trình duyệt dính vào request kiểu iOS cũng đủ để bị từ chối.
   */
  const fromSource = unpackHeaders(req.nextUrl.searchParams.get('h'));

  const headers: Record<string, string> = fromSource ?? BROWSER_HEADERS;

  /**
   * `?cap=<byte>` — chỉ lấy phần đầu file. Dùng cho đoạn xem trước khi rê chuột.
   *
   * Không chỉ để tiết kiệm băng thông: googlevideo bóp tốc độ những lời gọi luồng
   * adaptive không kèm `Range`, nên nếu để trình duyệt tự kéo từ byte 0 thì đoạn
   * xem trước lâu hiện một cách vô lý. Có `Range` là YouTube trả về ngay.
   *
   * Bên dưới còn khai báo lại độ dài file đúng bằng chỗ đã cắt, để trình duyệt
   * tưởng file chỉ dài ngần ấy: phát hết thì `loop` quay lại từ đầu thay vì xin
   * thêm byte rồi ăn lỗi 416.
   */
  const cap = Math.max(0, Number(req.nextUrl.searchParams.get('cap')) || 0);

  let range = req.headers.get('range');
  if (cap > 0) {
    const m = /bytes=(\d*)-(\d*)/.exec(range ?? '');
    const start = m?.[1] ? Number(m[1]) : 0;
    const wantEnd = m?.[2] ? Number(m[2]) : cap - 1;
    const end = Math.min(wantEnd, cap - 1);

    // xin phần nằm ngoài chỗ đã cắt: trả lời đúng chuẩn thay vì đẩy lên upstream
    if (start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${cap}`, 'Access-Control-Allow-Origin': '*' },
      });
    }
    range = `bytes=${start}-${end}`;
  }

  /**
   * Cắt yêu cầu mở đầu kiểu `bytes=N-` thành từng khúc có giới hạn.
   *
   * Ở chế độ 2 luồng, thẻ `<video>`/`<audio>` trỏ thẳng vào proxy và trình duyệt luôn
   * xin `Range: bytes=0-` (tới hết file). googlevideo bóp tốc độ những lời gọi luồng
   * adaptive không có điểm kết thúc — thường xuống sát tốc độ phát, có lúc thấp hơn.
   * Hệ quả là video "lâu lâu" mới chậm: tuỳ máy chủ googlevideo nào nhận request,
   * có cái bóp có cái không. Tua xong cũng vậy, vì tua là một lời gọi `bytes=N-` mới.
   *
   * yt-dlp tránh chuyện này bằng cách tải từng khúc 10 MB; làm y như vậy. Upstream
   * trả 206 kèm `Content-Range: bytes N-M/<tổng>` nên trình duyệt biết file còn dài
   * và tự xin khúc tiếp theo — không cần phía trình phát biết gì.
   */
  const CHUNK = Number(process.env.STREAM_CHUNK_BYTES ?? 10 * 1024 * 1024);
  if (cap === 0 && CHUNK > 0 && /(^|\.)googlevideo\.com$/i.test(target.hostname)) {
    const open = /^bytes=(\d+)-$/.exec(range ?? '');
    if (open) {
      const start = Number(open[1]);
      range = `bytes=${start}-${start + CHUNK - 1}`;
    }
  }

  const fetchWith = (h: Record<string, string>) =>
    fetch(target.toString(), {
      headers: range ? { ...h, Range: range } : h,
      cache: 'no-store',
      redirect: 'follow',
    });

  let upstream: Response;
  try {
    upstream = await fetchWith(headers);

    /**
     * 403 rồi thì thử nốt bộ header còn lại.
     *
     * Bộ của yt-dlp thường đúng, nhưng không phải luôn: có client yt-dlp không kèm
     * `http_headers` đầy đủ, và ngược lại có URL lấy từ InnerTube lại cần UA lạ.
     * Một lần thử thêm rẻ hơn nhiều so với việc người xem thấy màn hình lỗi.
     */
    if (upstream.status === 403) {
      const alt = fromSource ? BROWSER_HEADERS : null;
      if (alt) {
        console.warn('[stream] 403 với header của nguồn — thử lại bằng header trình duyệt');
        const retry = await fetchWith(alt);
        if (retry.ok) upstream = retry;
        else void retry.body?.cancel();
      }
    }
  } catch (e: any) {
    return new NextResponse(`upstream lỗi: ${e?.message ?? e}`, { status: 502 });
  }

  /**
   * Playlist HLS phải viết lại trước khi trả về.
   *
   * File .m3u8 chứa đường dẫn tới các playlist con và segment. Nếu để nguyên,
   * trình duyệt sẽ gọi thẳng googlevideo và bị CORS chặn. Nên bắt mọi phản hồi
   * kiểu m3u8 rồi thay từng đường dẫn thành lời gọi ngược lại chính proxy này —
   * làm vậy thì playlist con, segment, khoá mã hoá đều tự động đi đúng đường.
   */
  const ctype = upstream.headers.get('content-type') ?? '';
  const looksLikePlaylist =
    /mpegurl|x-mpegurl/i.test(ctype) || /\.m3u8(\?|$)/i.test(target.pathname + target.search);

  if (upstream.ok && looksLikePlaylist) {
    const text = await upstream.text();
    const base = target.toString();
    // Giữ nguyên `&h=` cho playlist con và segment: chúng cũng đi tới googlevideo
    // và cũng cần đúng bộ header đó, thiếu là 403 y như luồng chính.
    const packed = req.nextUrl.searchParams.get('h');
    const suffix = packed ? `&h=${packed}` : '';
    const self = `${req.nextUrl.origin}/api/stream?u=`;

    const rewritten = text
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (!t) return line;

        // dòng chỉ thị: chỉ có thuộc tính URI="..." là cần thay
        if (t.startsWith('#')) {
          return line.replace(
            /URI="([^"]+)"/g,
            (_m, u) => `URI="${self}${encodeURIComponent(new URL(u, base).toString())}${suffix}"`
          );
        }

        // dòng còn lại là đường dẫn, có thể tương đối
        try {
          return self + encodeURIComponent(new URL(t, base).toString()) + suffix;
        } catch {
          return line;
        }
      })
      .join('\n');

    return new NextResponse(rewritten, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const out = new Headers();
  for (const k of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'last-modified',
    'etag',
  ]) {
    const v = upstream.headers.get(k);
    if (v) out.set(k, v);
  }
  /*
    Nói dối về tổng kích thước khi có `cap`: file thật dài bao nhiêu không quan trọng,
    trình duyệt chỉ cần biết đúng phần mình được phép lấy. Không sửa thì nó thấy
    "0-3145727/50000000", tưởng còn 47 MB nữa, xin tiếp và ăn 416 giữa chừng —
    đoạn xem trước đứng hình thay vì lặp lại.
  */
  if (cap > 0) {
    const cr = out.get('content-range');
    const m = cr && /bytes (\d+)-(\d+)\/(\d+)/.exec(cr);
    if (m) {
      // File ngắn hơn mức chặn thì lấy độ dài thật, đừng hứa nhiều hơn cái đang có —
      // hứa thừa là trình duyệt đi xin phần không tồn tại rồi ăn 416.
      const shown = Math.min(cap, Number(m[3]));
      out.set('Content-Range', `bytes ${m[1]}-${m[2]}/${shown}`);
      out.set('Content-Length', String(Number(m[2]) - Number(m[1]) + 1));
    } else {
      // upstream lờ Range đi và trả cả file: đừng để lộ độ dài thật
      out.delete('content-length');
    }
    out.set('Accept-Ranges', 'bytes');
  }

  out.set('Access-Control-Allow-Origin', '*');
  out.set(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges, X-Youpe-Upstream-Status'
  );
  // Để phía trình phát đọc được lý do thật khi thẻ <video> chỉ nói "Format error"
  out.set('X-Youpe-Upstream-Status', String(upstream.status));

  /**
   * Câu trả lời hỏng thì TUYỆT ĐỐI không cache.
   *
   * Trước đây chỗ này set `private, max-age=3600` cho mọi phản hồi. Một cái 403 của
   * googlevideo (URL hết hạn, sai User-Agent…) thế là nằm lại trong cache đĩa của
   * trình duyệt nguyên một tiếng: bấm "Thử lại" bao nhiêu lần cũng vô ích vì request
   * không hề đi ra ngoài nữa, và trong tab Network nó hiện "(disk cache)" — trông
   * như server vẫn đang từ chối, trong khi thật ra chưa ai hỏi lại lần nào.
   */
  if (!upstream.ok) {
    out.set('Cache-Control', 'no-store');
    out.delete('content-length');
    out.set('Content-Type', 'text/plain; charset=utf-8');

    console.warn(`[stream] upstream ${upstream.status} — ${target.hostname}${target.pathname}`);

    // không đọc body nữa thì đóng luôn, đừng để kết nối treo
    void upstream.body?.cancel();

    // Nuốt luôn body của upstream: đó là trang lỗi HTML, đưa cho thẻ <video> thì nó
    // chỉ biết kêu "Format error". Trả câu ngắn gọn nói đúng chuyện gì đã xảy ra.
    return new NextResponse(
      `upstream ${upstream.status} — googlevideo từ chối URL này` +
        (fromSource ? '' : ' (không có header của nguồn kèm theo)'),
      { status: upstream.status, headers: out }
    );
  }

  out.set('Cache-Control', 'private, max-age=3600');

  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}

export async function HEAD(req: NextRequest) {
  const r = await GET(req);
  return new NextResponse(null, { status: r.status, headers: r.headers });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    },
  });
}
