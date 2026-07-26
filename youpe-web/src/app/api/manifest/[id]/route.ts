import { NextRequest, NextResponse } from 'next/server';
import { getPlayableInfo } from '@/lib/player';
import { getFromFallback } from '@/lib/piped';
import { buildDashFromFormats } from '@/lib/dash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function proxied(origin: string, raw: string) {
  return `${origin}/api/stream?u=${encodeURIComponent(raw)}`;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function rewriteHls(text: string, origin: string) {
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#'))
        return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxied(origin, u)}"`);
      return proxied(origin, t);
    })
    .join('\n');
}

const dashHeaders = (source: string) => ({
  'Content-Type': 'application/dash+xml',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'X-Youpe-Source': source,
});

/**
 * toDash() đổi chữ ký giữa các phiên bản youtubei.js:
 *   v17+ : toDash({ url_transformer, ... })   |   v13- : toDash(url_transformer, ...)
 */
async function buildDash(info: any, origin: string): Promise<string> {
  const transform = (url: URL) => new URL(proxied(origin, url.toString()));
  let dash = '';
  let firstErr: any = null;

  try {
    dash = await info.toDash({ url_transformer: transform });
  } catch (e) {
    firstErr = e;
  }
  if (!dash || dash.includes('googlevideo.com')) {
    try {
      dash = await info.toDash(transform);
    } catch (e) {
      if (!dash) throw firstErr ?? e;
    }
  }
  if (!dash) throw firstErr ?? new Error('toDash() không trả về manifest');

  if (dash.includes('googlevideo.com')) {
    dash = dash.replace(
      /(<BaseURL>)(https?:\/\/[^<]+)(<\/BaseURL>)/g,
      (_m, a, url, b) => a + escapeXml(proxied(origin, unescapeXml(url))) + b
    );
  }
  return dash;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = req.nextUrl.origin;
  const proxy = (u: string) => proxied(origin, u);
  const errors: string[] = [];

  // ---------- 1. InnerTube (tự chủ, chất lượng tốt nhất) ----------
  try {
    const { info, client } = await getPlayableInfo(id);

    const hls = info.streaming_data?.hls_manifest_url;
    if (info.basic_info?.is_live && hls) {
      const text = await (await fetch(hls)).text();
      return new NextResponse(rewriteHls(text, origin), {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'X-Youpe-Source': `innertube:${client}`,
        },
      });
    }

    const dash = await buildDash(info, origin);
    return new NextResponse(dash, { headers: dashHeaders(`innertube:${client}`) });
  } catch (e: any) {
    errors.push(`innertube: ${e?.message ?? e}`);
    console.warn(`[manifest ${id}] innertube hỏng, chuyển sang fallback —`, e?.message ?? e);
  }

  // ---------- 2. Piped / Invidious ----------
  try {
    const { result } = await getFromFallback(id);

    if (result.isLive && result.hls) {
      const text = await (await fetch(result.hls)).text();
      return new NextResponse(rewriteHls(text, origin), {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'X-Youpe-Source': result.source,
        },
      });
    }

    const dash = buildDashFromFormats(result, proxy);
    if (dash) {
      console.info(`[manifest ${id}] dùng ${result.source}`);
      return new NextResponse(dash, { headers: dashHeaders(result.source) });
    }
    errors.push(`${result.source}: format thiếu init/index range, không dựng được DASH`);
  } catch (e: any) {
    errors.push(`fallback: ${e?.message ?? e}`);
  }

  console.error(`[manifest ${id}]`, errors.join(' || '));
  return new NextResponse(`manifest error: ${errors.join(' || ')}`, {
    status: 500,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
