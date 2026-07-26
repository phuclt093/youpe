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

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    Origin: 'https://www.youtube.com',
    Referer: 'https://www.youtube.com/',
  };
  const range = req.headers.get('range');
  if (range) headers['Range'] = range;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { headers, cache: 'no-store', redirect: 'follow' });
  } catch (e: any) {
    return new NextResponse(`upstream lỗi: ${e?.message ?? e}`, { status: 502 });
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
  out.set('Access-Control-Allow-Origin', '*');
  out.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
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
