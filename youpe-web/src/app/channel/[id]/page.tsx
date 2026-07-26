'use client';

import { use, useEffect, useState } from 'react';
import VideoCard, { CardSkeleton } from '@/components/VideoCard';
import { VerifiedIcon } from '@/components/Icons';
import type { VideoItem } from '@/lib/types';

type ChannelData = {
  id: string; name: string; avatar: string; banner: string;
  subsText: string; description: string; handle: string;
  verified: boolean; videos: VideoItem[]; error?: string;
};

const TABS = [
  { key: 'videos', label: 'Video' },
  { key: 'shorts', label: 'Shorts' },
  { key: 'live', label: 'Trực tiếp' },
];

export default function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState('videos');
  const [data, setData] = useState<ChannelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/channel/${id}?tab=${tab}`)
      .then((r) => r.json())
      .then((j) => alive && setData(j))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, tab]);

  return (
    <div className="pb-16">
      {data?.banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.banner} alt="" className="mx-auto block max-h-[210px] w-full max-w-[1284px] object-cover sm:rounded-xl" />
      )}

      <div className="mx-auto max-w-[1284px] px-4 sm:px-6">
        <div className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:items-start">
          {data?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.avatar} alt="" className="h-32 w-32 rounded-full object-cover" />
          ) : (
            <div className="skeleton h-32 w-32 rounded-full" />
          )}
          <div className="min-w-0 text-center sm:pt-4 sm:text-left">
            <h1 className="flex items-center justify-center gap-2 text-2xl font-bold sm:justify-start">
              {data?.name ?? '…'}
              {data?.verified && <VerifiedIcon className="h-4 w-4 text-yt-sub" />}
            </h1>
            <p className="mt-1 text-sm text-yt-sub">
              {data?.handle} {data?.subsText && `· ${data.subsText}`}
            </p>
            <p className="mt-1 line-clamp-1 max-w-xl text-sm text-yt-sub">{data?.description}</p>
            <button className="mt-4 rounded-full bg-yt-text px-4 py-2 text-sm font-medium text-yt-bg hover:bg-white/90">
              Đăng ký
            </button>
          </div>
        </div>

        <div className="mb-6 flex gap-6 border-b border-yt-border text-sm font-medium">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-1 pb-3 ${
                tab === t.key ? 'border-yt-text' : 'border-transparent text-yt-sub hover:text-yt-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
            : data?.videos?.map((v, i) => <VideoCard key={v.id} v={v} index={i} />)}
        </div>

        {!loading && !data?.videos?.length && (
          <p className="py-16 text-center text-yt-sub">Không có video trong mục này.</p>
        )}
      </div>
    </div>
  );
}
