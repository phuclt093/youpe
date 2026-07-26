'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import VideoCard, { CardSkeleton } from '@/components/VideoCard';
import Chips from '@/components/Chips';
import { TOPICS, topicByKey } from '@/lib/topics';
import type { VideoItem } from '@/lib/types';

const CHIPS = TOPICS.map((t) => ({ key: t.key, label: t.label }));

export default function HomePage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') ?? 'home';
  const topic = topicByKey(tab);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [err, setErr] = useState('');

  const sentinel = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());

  /* ---------- nạp lần đầu ---------- */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    setVideos([]);
    setCanLoadMore(false);
    seen.current = new Set();
    window.scrollTo({ top: 0 });

    fetch(`/api/feed?tab=${tab}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const list: VideoItem[] = j.videos ?? [];
        list.forEach((v) => seen.current.add(v.id));
        setVideos(list);
        setCanLoadMore(!!j.canLoadMore && list.length > 0);
        if (j.error) setErr(j.error);
      })
      .catch((e) => alive && setErr(String(e)))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [tab]);

  /* ---------- nạp thêm ---------- */
  const loadMore = useCallback(async () => {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/feed?tab=${tab}&more=1`);
      const j = await r.json();
      const fresh: VideoItem[] = (j.videos ?? []).filter((v: VideoItem) => !seen.current.has(v.id));
      fresh.forEach((v: VideoItem) => seen.current.add(v.id));

      if (fresh.length) setVideos((prev) => [...prev, ...fresh]);
      if (j.done || !fresh.length) setCanLoadMore(false);
    } catch {
      setCanLoadMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [tab, loadingMore, canLoadMore]);

  // tự nạp khi cuộn gần tới cuối
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canLoadMore) return;

    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(),
      { rootMargin: '600px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, loadMore]);

  return (
    <div className="px-4 pb-16 sm:px-6">
      <Chips
        items={CHIPS}
        active={tab}
        onPick={(key) => router.push(key === 'home' ? '/' : `/?tab=${key}`)}
      />

      {tab !== 'home' && (
        <h1 className="mb-4 mt-1 text-xl font-bold">{topic.label}</h1>
      )}

      {err && !videos.length && !loading && (
        <div className="grid place-items-center py-20 text-center">
          <svg viewBox="0 0 24 24" className="mb-3 h-12 w-12 text-yt-sub" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z" />
          </svg>
          <p className="text-base">Không tải được nội dung</p>
          <p className="mt-1 max-w-lg text-sm text-yt-sub">{err}</p>
          <button
            onClick={() => router.refresh()}
            className="mt-4 rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-[#3f3f3f]"
          >
            Thử lại
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
        {loading
          ? Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} />)
          : videos.map((v, i) => <VideoCard key={v.id} v={v} index={i} />)}

        {loadingMore &&
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={`more-${i}`} />)}
      </div>

      <div ref={sentinel} className="h-4" />

      {!loading && !canLoadMore && videos.length > 0 && (
        <p className="py-10 text-center text-sm text-yt-sub">Hết rồi</p>
      )}
    </div>
  );
}
