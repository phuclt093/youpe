'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import VideoCard, { CardSkeleton } from '@/components/VideoCard';
import { getSubs, onSubsChange, unsubscribe, type SubChannel } from '@/lib/subs';
import type { VideoItem } from '@/lib/types';

/**
 * Gom video mới nhất từ các kênh đã đăng ký.
 * Gọi song song từng kênh rồi trộn lại — server có cache nên không nặng.
 */
export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<SubChannel[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshSubs = useCallback(() => setSubs(getSubs()), []);

  useEffect(() => {
    refreshSubs();
    return onSubsChange(refreshSubs);
  }, [refreshSubs]);

  useEffect(() => {
    if (!subs.length) {
      setVideos([]);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    Promise.allSettled(
      subs.slice(0, 20).map((c) => fetch(`/api/channel/${c.id}?tab=videos`).then((r) => r.json()))
    )
      .then((results) => {
        if (!alive) return;
        const seen = new Set<string>();
        const merged: VideoItem[] = [];

        // lấy 4 video mới nhất mỗi kênh, tránh một kênh chiếm hết trang
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          for (const v of ((r.value?.videos ?? []) as VideoItem[]).slice(0, 4)) {
            if (!seen.has(v.id)) {
              seen.add(v.id);
              merged.push(v);
            }
          }
        }
        setVideos(merged);
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [subs]);

  return (
    <div className="px-4 pb-16 pt-6 sm:px-6">
      <h1 className="mb-5 text-2xl font-bold">Kênh đăng ký</h1>

      {subs.length > 0 && (
        <div className="no-scrollbar mb-8 flex gap-5 overflow-x-auto pb-2">
          {subs.map((c) => (
            <div key={c.id} className="group/ch flex w-20 shrink-0 flex-col items-center">
              <Link href={`/channel/${c.id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.avatar}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover transition-transform group-hover/ch:scale-105"
                />
              </Link>
              <p className="mt-2 line-clamp-2 text-center text-xs leading-4">{c.name}</p>
              <button
                onClick={() => unsubscribe(c.id)}
                className="mt-1 text-[11px] text-yt-sub opacity-0 transition hover:text-yt-red group-hover/ch:opacity-100"
              >
                Bỏ đăng ký
              </button>
            </div>
          ))}
        </div>
      )}

      {!subs.length && !loading && (
        <div className="grid place-items-center py-24 text-center">
          <svg viewBox="0 0 24 24" className="mb-4 h-14 w-14 text-yt-sub" fill="currentColor" aria-hidden>
            <path d="M10 18v-6l5 3-5 3zm7-15H7v1h10V3zm3 3H4v1h16V6zm2 3H2v12h20V9zM3 10h18v10H3V10z" />
          </svg>
          <p className="text-lg">Chưa đăng ký kênh nào</p>
          <p className="mt-2 max-w-md text-sm text-yt-sub">
            Bấm nút Đăng ký ở trang xem video hoặc trang kênh, video mới của họ sẽ gom về đây.
          </p>
          <Link
            href="/"
            className="mt-5 rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-[#3f3f3f]"
          >
            Khám phá video
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
        {loading && subs.length > 0
          ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
          : videos.map((v, i) => <VideoCard key={v.id} v={v} index={i} />)}
      </div>
    </div>
  );
}
