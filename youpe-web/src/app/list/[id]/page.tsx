'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { VideoItem } from '@/lib/types';
import { Thumb, CardSkeleton } from '@/components/VideoCard';
import EmptyState from '@/components/EmptyState';
import { PlaylistIcon } from '@/components/Icons';

type Data = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  totalItems: string;
  views: string;
  lastUpdated: string;
  author: { id: string; name: string; avatar: string };
  videos: VideoItem[];
  error?: string;
};

/**
 * Trang xem một danh sách phát của YouTube.
 *
 * Trước đây bấm vào danh sách phát ở trang kênh là bị đẩy sang youtube.com — đúng
 * cái mà app này sinh ra để tránh. Giờ mọi thứ ở lại trong app.
 */
export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr('');

    fetch(`/api/playlist/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) setErr(j.error);
        else setData(j);
      })
      .catch((e) => alive && setErr(String(e?.message ?? e)));

    return () => {
      alive = false;
    };
  }, [id]);

  if (err) {
    return (
      <EmptyState
        title="Không mở được danh sách phát"
        hint={err}
        actionLabel="Về trang chủ"
        actionHref="/"
      />
    );
  }

  const first = data?.videos?.[0];

  return (
    <div className="px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* thẻ mô tả bên trái, giống bố cục của YouTube */}
        <aside className="lg:sticky lg:top-20 lg:h-fit lg:w-[340px] lg:shrink-0">
          <div className="overflow-hidden rounded-xl bg-yt-elev p-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-yt-bg">
              {data?.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.thumbnail} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-yt-sub">
                  <PlaylistIcon className="h-10 w-10" />
                </div>
              )}
            </div>

            <h1 className="mt-4 text-xl font-bold leading-tight">
              {data?.title ?? 'Đang tải…'}
            </h1>

            {data?.author.name && (
              <Link
                href={data.author.id ? `/channel/${data.author.id}` : '#'}
                className="mt-3 flex items-center gap-2 text-sm hover:text-white"
              >
                {data.author.avatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.author.avatar} alt="" className="h-6 w-6 rounded-full" />
                )}
                <span className="font-medium">{data.author.name}</span>
              </Link>
            )}

            <p className="mt-2 text-xs text-yt-sub">
              {[data?.totalItems, data?.views, data?.lastUpdated].filter(Boolean).join(' · ')}
            </p>

            {first && (
              <Link
                href={`/watch?v=${first.id}`}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-white/90"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
                Phát tất cả
              </Link>
            )}

            {data?.description && (
              <p className="mt-4 whitespace-pre-wrap text-xs leading-5 text-yt-sub">
                {data.description}
              </p>
            )}
          </div>
        </aside>

        {/* danh sách video, đánh số như YouTube */}
        <div className="min-w-0 flex-1 space-y-2">
          {!data
            ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
            : data.videos.map((v, i) => (
                <Link
                  key={`${v.id}-${i}`}
                  href={`/watch?v=${v.id}`}
                  style={{ animationDelay: `${Math.min(i, 11) * 30}ms` }}
                  className="anim-fade-up group flex gap-3 rounded-xl p-2 hover:bg-yt-hover"
                >
                  <span className="w-6 shrink-0 self-center text-center text-xs text-yt-sub">
                    {i + 1}
                  </span>

                  <div className="w-[160px] shrink-0">
                    <Thumb v={v} />
                  </div>

                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="line-clamp-2 text-sm font-medium leading-5">{v.title}</p>
                    <p className="mt-1 text-xs text-yt-sub">{v.author.name}</p>
                    <p className="text-xs text-yt-sub">
                      {[v.viewsText, v.publishedText].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </Link>
              ))}

          {data && !data.videos.length && (
            <p className="py-10 text-center text-sm text-yt-sub">
              Danh sách này không có video nào xem được.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
