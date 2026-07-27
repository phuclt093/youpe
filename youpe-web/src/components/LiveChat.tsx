'use client';

import { useEffect, useRef, useState } from 'react';

type ChatMessage = {
  id: string;
  author: string;
  avatar: string;
  message: string;
  isPaid: boolean;
  amount: string;
  badges: string[];
};

/** Giữ bấy nhiêu tin gần nhất, chat đông có thể vài chục tin mỗi giây */
const MAX_MESSAGES = 250;

/**
 * Khung trò chuyện của video trực tiếp.
 *
 * Nhận tin qua Server-Sent Events từ `/api/livechat/[id]`. Chỉ đọc, không gửi được —
 * gửi tin cần tài khoản Google đã đăng nhập, mà app dùng tài khoản nội bộ riêng.
 */
export default function LiveChat({ videoId }: { videoId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'ended' | 'error'>('connecting');
  const [note, setNote] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setStatus('connecting');
    setNote('');

    const es = new EventSource(`/api/livechat/${videoId}`);

    es.addEventListener('ready', () => setStatus('live'));

    es.addEventListener('message', (e) => {
      try {
        const msg: ChatMessage = JSON.parse((e as MessageEvent).data);
        setMessages((prev) => {
          const next = [...prev, msg];
          return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
        });
      } catch {
        /* dòng hỏng thì bỏ qua */
      }
    });

    es.addEventListener('warn', (e) => {
      try {
        setNote(JSON.parse((e as MessageEvent).data).message ?? '');
      } catch {
        /* bỏ qua */
      }
    });

    es.addEventListener('end', () => {
      setStatus('ended');
      es.close();
    });

    es.onerror = () => {
      // EventSource tự kết nối lại, chỉ báo lỗi khi nó đóng hẳn
      if (es.readyState === EventSource.CLOSED) setStatus('error');
    };

    return () => es.close();
  }, [videoId]);

  // tự cuộn xuống, trừ khi người dùng đang đọc lại tin cũ
  useEffect(() => {
    if (!autoScroll) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, autoScroll]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-yt-border">
      <div className="flex items-center justify-between border-b border-yt-border px-4 py-3">
        <p className="text-sm font-medium">Trò chuyện trực tiếp</p>
        <span className="flex items-center gap-1.5 text-xs text-yt-sub">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === 'live' ? 'bg-yt-red' : 'bg-yt-sub'
            }`}
          />
          {status === 'connecting' && 'đang kết nối'}
          {status === 'live' && 'trực tiếp'}
          {status === 'ended' && 'đã kết thúc'}
          {status === 'error' && 'mất kết nối'}
        </span>
      </div>

      <div
        ref={listRef}
        onScroll={onScroll}
        className="no-scrollbar flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
      >
        {!messages.length && status === 'connecting' && (
          <p className="py-6 text-center text-sm text-yt-sub">Đang kết nối…</p>
        )}

        {!messages.length && status === 'live' && (
          <p className="py-6 text-center text-sm text-yt-sub">Chưa có tin nhắn nào</p>
        )}

        {status === 'error' && (
          <p className="py-6 text-center text-sm text-yt-sub">
            Không kết nối được. Buổi phát có thể đã kết thúc.
          </p>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 text-sm ${
              m.isPaid ? 'rounded-lg bg-yt-blue/15 p-2' : ''
            }`}
          >
            {m.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatar} alt="" loading="lazy" className="mt-0.5 h-6 w-6 shrink-0 rounded-full" />
            ) : (
              <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-yt-elev" />
            )}

            <p className="min-w-0 break-words leading-5">
              <span className="mr-1.5 text-[13px] font-medium text-yt-sub">{m.author}</span>

              {m.badges.includes('Owner') && (
                <span className="mr-1 rounded bg-yt-red px-1 text-[10px]">chủ kênh</span>
              )}

              {m.isPaid && m.amount && (
                <span className="mr-1 rounded bg-yt-blue px-1.5 text-[11px] font-medium">
                  {m.amount}
                </span>
              )}

              <span>{m.message}</span>
            </p>
          </div>
        ))}
      </div>

      {!autoScroll && (
        <button
          onClick={() => setAutoScroll(true)}
          className="border-t border-yt-border bg-yt-elev py-2 text-xs font-medium hover:bg-yt-hover"
        >
          Xem tin mới nhất
        </button>
      )}

      <p className="border-t border-yt-border px-4 py-2.5 text-[11px] leading-4 text-yt-sub">
        {note || 'Chỉ đọc — gửi tin nhắn cần đăng nhập tài khoản Google.'}
      </p>
    </div>
  );
}
