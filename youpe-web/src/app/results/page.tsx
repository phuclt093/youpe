'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Thumb } from '@/components/VideoCard';
import { viPublished } from '@/lib/format';
import { VerifiedIcon } from '@/components/Icons';
import EmptyState from '@/components/EmptyState';
import { cancelPrefetch, prefetchNow, prefetchOnHover } from '@/lib/prefetch';
import type { VideoItem, ChannelItem } from '@/lib/types';

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'video', label: 'Video' },
  { key: 'channel', label: 'Kênh' },
  { key: 'playlist', label: 'Danh sách phát' },
];

export default function ResultsPage() {
  const q = useSearchParams().get('q') ?? '';
  const [filter, setFilter] = useState('all');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}&filter=${filter}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setVideos(j.videos ?? []);
        setChannels(j.channels ?? []);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q, filter]);

  return (
    <div className="mx-auto max-w-[1096px] px-4 pb-16 pt-4 sm:px-6">
      <div className="no-scrollbar mb-4 flex gap-3 overflow-x-auto border-b border-yt-border pb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              filter === f.key ? 'bg-yt-text text-yt-bg' : 'bg-yt-chip hover:bg-[#3f3f3f]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="py-10 text-center text-yt-sub">Đang tìm…</p>}

      {!loading && channels.map((c) => (
        <div key={c.id} className="mb-6 flex items-center gap-6 border-b border-yt-border pb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.avatar} alt="" className="h-[136px] w-[136px] rounded-full object-cover" />
          <div className="min-w-0">
            <Link href={`/channel/${c.id}`} className="text-lg font-medium hover:underline">
              {c.name}
            </Link>
            <p className="text-xs text-yt-sub">{c.subsText}</p>
          </div>
        </div>
      ))}

      <div className="space-y-4">
        {!loading && videos.map((v) => (
          <Link
            key={v.id}
            href={`/watch?v=${v.id}`}
            onMouseEnter={() => prefetchOnHover(v.id)}
            onMouseLeave={() => cancelPrefetch(v.id)}
            onMouseDown={() => prefetchNow(v.id)}
            className="group flex flex-col gap-3 sm:flex-row"
          >
            <div className="w-full shrink-0 sm:w-[360px]">
              <Thumb v={v} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-lg leading-6">{v.title}</h3>
              <p className="mt-1 text-xs text-yt-sub">
                {v.viewsText}
                {v.viewsText && v.publishedText ? ' · ' : ''}
                {viPublished(v.publishedText)}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-yt-sub">
                {v.author.avatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.author.avatar} alt="" className="h-6 w-6 rounded-full" />
                )}
                <span>{v.author.name}</span>
                {v.author.verified && <VerifiedIcon />}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {!loading && !videos.length && !channels.length && (
        <EmptyState
          title={`Không có kết quả cho "${q}"`}
          hint="Thử từ khoá ngắn hơn, hoặc bỏ bớt dấu."
          actionLabel="Về trang chủ"
          actionHref="/"
        />
      )}
    </div>
  );
}
