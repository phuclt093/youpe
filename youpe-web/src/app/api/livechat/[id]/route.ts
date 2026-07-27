import { NextRequest, NextResponse } from 'next/server';
import { getYT, txt, bestThumb } from '@/lib/innertube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Trò chuyện trực tiếp, đẩy về bằng Server-Sent Events.
 *
 * `info.getLiveChat()` của youtubei.js trả về một EventEmitter tự hỏi YouTube theo
 * chu kỳ. Đó là đối tượng sống lâu ở phía server, không gói vào một lời gọi HTTP
 * bình thường được — nên dùng SSE: giữ kết nối mở, có tin nhắn nào thì đẩy ngay.
 *
 * Trình duyệt đóng tab là `req.signal` bắn abort, ta gọi `chat.stop()` để khỏi
 * bỏ quên tiến trình hỏi vòng chạy mãi.
 */

/** Bóc một hành động của chat thành thứ giao diện dùng được */
function mapAction(action: any) {
  const item = action?.item;
  if (!item) return null;

  const type = item.type as string;

  // chỉ lấy tin nhắn thường và tin có donate, bỏ các loại phụ
  const isText = type === 'LiveChatTextMessage';
  const isPaid = type === 'LiveChatPaidMessage' || type === 'LiveChatPaidSticker';
  if (!isText && !isPaid) return null;

  const message = txt(item.message) || txt(item.header_primary_text) || '';
  const author = txt(item.author?.name);
  if (!author && !message) return null;

  return {
    id: item.id ?? `${Date.now()}-${Math.random()}`,
    author,
    avatar: bestThumb(item.author?.thumbnails),
    message,
    isPaid,
    amount: isPaid ? txt(item.purchase_amount) : '',
    // badge của chủ kênh / quản trị viên / thành viên
    badges: (item.author?.badges ?? [])
      .map((b: any) => txt(b?.tooltip) || txt(b?.label))
      .filter(Boolean),
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let info: any;
  try {
    const yt: any = await getYT();
    info = await yt.getInfo(id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'không lấy được video' }, { status: 500 });
  }

  if (!info?.basic_info?.is_live || !info.livechat) {
    return NextResponse.json({ error: 'video này không có trò chuyện trực tiếp' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let chat: any = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          /* kết nối đã đóng */
        }
      };

      const shutdown = () => {
        if (closed) return;
        closed = true;
        try {
          chat?.stop();
        } catch {
          /* đã dừng rồi */
        }
        try {
          controller.close();
        } catch {
          /* đã đóng rồi */
        }
      };

      try {
        chat = info.getLiveChat();

        chat.on('start', () => send('ready', { ok: true }));

        chat.on('chat-update', (action: any) => {
          const msg = mapAction(action);
          if (msg) send('message', msg);
        });

        chat.on('metadata-update', (m: any) => {
          send('meta', {
            viewers: txt(m?.views?.view_count) || txt(m?.view_count) || '',
            title: txt(m?.title),
          });
        });

        chat.on('error', (e: any) => send('warn', { message: e?.message ?? String(e) }));
        chat.on('end', () => {
          send('end', {});
          shutdown();
        });

        chat.start();
      } catch (e: any) {
        send('warn', { message: e?.message ?? String(e) });
        shutdown();
        return;
      }

      // trình duyệt đóng tab hoặc rời trang
      req.signal.addEventListener('abort', shutdown);

      // nhịp giữ kết nối, tránh proxy cắt ngang khi chat vắng
      const keepAlive = setInterval(() => {
        if (closed) {
          clearInterval(keepAlive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(keepAlive);
        }
      }, 20_000);
    },

    cancel() {
      closed = true;
      try {
        chat?.stop();
      } catch {
        /* đã dừng */
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
