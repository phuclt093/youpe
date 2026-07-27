'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import VideoCard, { CardSkeleton } from '@/components/VideoCard';
import EmptyState from '@/components/EmptyState';
import { PlaylistIcon, VerifiedIcon } from '@/components/Icons';
import type { VideoItem } from '@/lib/types';
import * as subs from '@/lib/subs';

type ChannelData = {
  id: string; name: string; avatar: string; banner: string;
  subsText: string; description: string; handle: string;
  verified: boolean; videos: VideoItem[];
  playlists: ChannelPlaylist[]; sorts: string[];
  error?: string; tabError?: string;
};

type ChannelPlaylist = {
  id: string; title: string; thumbnail: string; videoCount: string;
};

const TABS = [
  { key: 'videos', label: 'Video' },
  { key: 'shorts', label: 'Shorts' },
  { key: 'live', label: 'Trực tiếp' },
  { key: 'playlists', label: 'Danh sách phát' },
];

/** Nhãn chip của YouTube là tiếng Anh cố định, đây là bản dịch để hiển thị */
const SORTS = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'popular', label: 'Phổ biến' },
  { key: 'oldest', label: 'Cũ nhất' },
];

export default function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState('videos');
  const [sort, setSort] = useState('newest');
  const [data, setData] = useState<ChannelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subbed, setSubbed] = useState(false);

  useEffect(() => setSubbed(subs.isSubscribed(id)), [id]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/channel/${id}?tab=${tab}&sort=${sort}`)
      .then((r) => r.json())
      .then((j) => alive && setData(j))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, tab, sort]);

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
            <button
              onClick={() =>
                data &&
                setSubbed(
                  subs.toggleSub({
                    id: data.id,
                    name: data.name,
                    avatar: data.avatar,
                    subsText: data.subsText,
                  })
                )
              }
              className={`mt-4 rounded-full px-4 py-2 text-sm font-medium ${
                subbed
                  ? 'bg-yt-chip text-yt-text hover:bg-[#3f3f3f]'
                  : 'bg-yt-text text-yt-bg hover:bg-white/90'
              }`}
            >
              {subbed ? 'Đã đăng ký' : 'Đăng ký'}
            </button>
          </div>
        </div>

        <div className="mb-4 flex gap-6 overflow-x-auto border-b border-yt-border text-sm font-medium no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px shrink-0 border-b-2 px-1 pb-3 ${
                tab === t.key ? 'border-yt-text' : 'border-transparent text-yt-sub hover:text-yt-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'videos' && (
          <div className="mb-6 flex gap-2">
            {SORTS.map((sv) => (
              <button
                key={sv.key}
                onClick={() => setSort(sv.key)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  sort === sv.key
                    ? 'bg-yt-text font-medium text-yt-bg'
                    : 'bg-yt-chip hover:bg-[#3f3f3f]'
                }`}
              >
                {sv.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'playlists' ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
              : (data?.playlists ?? []).map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/watch?v=&list=${p.id}`}
                    style={{ animationDelay: `${Math.min(i, 11) * 35}ms` }}
                    className="anim-fade-up group flex flex-col"
                    onClick={(e) => {
                      // chưa có trang xem playlist của YouTube, mở thẳng trên youtube.com
                      e.preventDefault();
                      window.open(`https://www.youtube.com/playlist?list=${p.id}`, '_blank');
                    }}
                  >
                    <div className="card-thumb relative aspect-video w-full overflow-hidden rounded-xl bg-yt-elev">
                      {p.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-yt-sub">
                          <PlaylistIcon className="h-8 w-8" />
                        </div>
                      )}
                      <div className="absolute bottom-0 right-0 flex h-full w-[45%] flex-col items-center justify-center bg-black/70 text-xs">
                        <PlaylistIcon className="mb-1 h-5 w-5" />
                        {p.videoCount || 'Danh sách'}
                      </div>
                    </div>
                    <p className="card-title mt-3 line-clamp-2 text-[15px] font-medium leading-[22px]">
                      {p.title}
                    </p>
                  </Link>
                ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
              : data?.videos?.map((v, i) => <VideoCard key={v.id} v={v} index={i} />)}
          </div>
        )}

        {!loading &&
          !data?.videos?.length &&
          !data?.playlists?.length && (
            <EmptyState
              title="Không có gì trong mục này"
              hint={data?.tabError || 'Kênh này chưa đăng nội dung ở mục bạn chọn.'}
            />
          )}

      </div>
    </div>
  );
}
