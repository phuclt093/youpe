'use client';

import { useEffect, useState } from 'react';
import { LikeIcon, DislikeIcon, VerifiedIcon } from './Icons';
import type { CommentItem } from '@/lib/types';

export default function Comments({ videoId }: { videoId: string }) {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [total, setTotal] = useState('');
  const [sort, setSort] = useState<'top' | 'newest'>('top');
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLimit(10);
    fetch(`/api/comments/${videoId}?sort=${sort}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setItems(j.comments ?? []);
        setTotal(j.total ?? '');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [videoId, sort]);

  return (
    <section className="mt-6">
      <div className="mb-6 flex items-center gap-8">
        <h2 className="text-xl font-bold">{total || `${items.length} bình luận`}</h2>
        <div className="flex gap-3 text-sm">
          {(['top', 'newest'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-full px-3 py-1 ${sort === s ? 'bg-yt-chip font-medium' : 'text-yt-sub hover:text-yt-text'}`}
            >
              {s === 'top' ? 'Hàng đầu' : 'Mới nhất'}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-yt-sub">Đang tải bình luận…</p>}
      {!loading && !items.length && <p className="text-sm text-yt-sub">Chưa có bình luận nào.</p>}

      <ul className="space-y-4">
        {items.slice(0, limit).map((c) => (
          <li key={c.id} className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full" loading="lazy" />
            <div className="min-w-0 flex-1">
              {c.isPinned && <p className="mb-1 text-xs text-yt-sub">📌 Đã ghim</p>}
              <p className="flex items-center gap-1 text-[13px] font-medium">
                <span className={c.isOwner ? 'rounded-full bg-yt-chip px-2 py-0.5' : ''}>{c.author}</span>
                <span className="font-normal text-yt-sub">{c.published}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">{c.text}</p>
              <div className="mt-2 flex items-center gap-4 text-xs text-yt-sub">
                <span className="flex items-center gap-1">
                  <LikeIcon className="h-4 w-4" /> {c.likes}
                </span>
                <DislikeIcon className="h-4 w-4" />
                {c.isHearted && <span title="Được tác giả yêu thích">❤️</span>}
                {c.replyCount > 0 && (
                  <span className="text-yt-blue">{c.replyCount} phản hồi</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {limit < items.length && (
        <button
          onClick={() => setLimit((l) => l + 20)}
          className="mt-6 rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-[#3f3f3f]"
        >
          Xem thêm bình luận
        </button>
      )}
    </section>
  );
}
