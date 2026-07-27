'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PlayerSlot, usePlayer } from '@/components/PlayerHost';
import Comments from '@/components/Comments';
import VideoCard from '@/components/VideoCard';
import { LikeIcon, DislikeIcon, ShareIcon, ClockIcon, VerifiedIcon, MoreIcon, BellIcon } from '@/components/Icons';
import { formatCount, viPublished } from '@/lib/format';
import * as store from '@/lib/storage';
import { prefetchNow } from '@/lib/prefetch';
import * as subs from '@/lib/subs';
import SaveToPlaylist from '@/components/SaveToPlaylist';
import LiveChat from '@/components/LiveChat';
import Description from '@/components/Description';
import type { VideoDetail, VideoItem } from '@/lib/types';

export default function WatchPage() {
  const id = useSearchParams().get('v') ?? '';
  const router = useRouter();
  const [data, setData] = useState<VideoDetail | null>(null);
  const [err, setErr] = useState('');
  const [theater, setTheater] = useState(false);
  const { play, mode: playerMode } = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [subbed, setSubbed] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [related, setRelated] = useState<VideoItem[]>([]);
  const [mix, setMix] = useState<{ source: string; count: number }[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);

  useEffect(() => {
    if (!id) return;
    setData(null);
    setErr('');
    fetch(`/api/video/${id}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setData(j)))
      .catch((e) => setErr(String(e)));
  }, [id]);

  // đưa video cho trình phát dùng chung — nó sống ngoài cây trang nên
  // chuyển trang không làm video nạp lại
  useEffect(() => {
    if (!data) return;
    play({
      videoId: data.id,
      title: data.title,
      channelName: data.channel.name,
      poster: `https://i.ytimg.com/vi/${data.id}/maxresdefault.jpg`,
      captions: data.captions,
      related: (related.length ? related : data.related).map((v) => ({
        id: v.id,
        title: v.title,
        thumbnail: v.thumbnail,
        durationText: v.durationText,
        author: { name: v.author.name },
      })),
    });
  }, [data, related, play]);

  // gợi ý: trộn nhiều nguồn, có pha thêm hành vi xem gần đây
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoadingRelated(true);
    setRelated([]);
    setMix([]);

    const seedTitles = store
      .getList('history')
      .slice(0, 12)
      .filter((v) => v.id !== id)
      .map((v) => v.title);

    fetch(`/api/related/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seedTitles }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setRelated(j.videos ?? []);
        setMix(j.mix ?? []);
      })
      .catch(() => {})
      .finally(() => alive && setLoadingRelated(false));

    return () => {
      alive = false;
    };
  }, [id]);

  // lưu lịch sử xem
  useEffect(() => {
    if (!data) return;
    const item: VideoItem = {
      id: data.id,
      title: data.title,
      thumbnail: `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
      durationSec: data.durationSec,
      durationText: '',
      viewsText: data.viewsText,
      publishedText: data.publishedText,
      isLive: data.isLive,
      author: { id: data.channel.id, name: data.channel.name, avatar: data.channel.avatar, verified: data.channel.verified },
    };
    store.add('history', item);
    setLiked(store.has('liked', data.id));
    setSaved(store.has('later', data.id));
    setSubbed(subs.isSubscribed(data.channel.id));
  }, [data]);

  // Đang xem thì âm thầm lấy sẵn luồng của video kế tiếp — bấm sang là phát ngay.
  // Hoãn 4 giây để không tranh băng thông với video đang chạy.
  useEffect(() => {
    const next = related[0]?.id;
    if (!next) return;
    const t = setTimeout(() => prefetchNow(next), 4000);
    return () => clearTimeout(t);
  }, [related]);

  const asItem = (d: VideoDetail): VideoItem => ({
    id: d.id,
    title: d.title,
    thumbnail: `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
    durationSec: d.durationSec,
    durationText: '',
    viewsText: d.viewsText,
    publishedText: d.publishedText,
    isLive: d.isLive,
    author: { id: d.channel.id, name: d.channel.name, avatar: d.channel.avatar, verified: d.channel.verified },
  });

  if (!id) return <p className="p-10 text-center text-yt-sub">Thiếu ID video.</p>;

  return (
    <div className={`mx-auto px-4 pb-16 pt-6 ${theater ? 'max-w-none px-0' : 'max-w-[1754px] lg:px-6'}`}>
      <div className={theater ? '' : 'flex flex-col gap-6 xl:flex-row'}>
        {/* cột chính */}
        <div className={theater ? '' : 'min-w-0 flex-1 xl:max-w-[1280px]'}>
          {err ? (
            <div className="aspect-video grid place-items-center rounded-xl bg-yt-elev px-6 text-center">
              <p className="text-sm text-yt-sub">Không phát được video: {err}</p>
            </div>
          ) : data ? (
            <PlayerSlot />
          ) : (
            <div className="skeleton aspect-video w-full rounded-xl" />
          )}

          <div className={theater ? 'mx-auto max-w-[1280px] px-4 lg:px-6' : ''}>
            {/* tiêu đề */}
            <h1 className="mt-3 text-xl font-bold leading-7">
              {data?.title ?? <span className="skeleton block h-6 w-2/3 rounded" />}
            </h1>

            {/* hàng kênh + hành động */}
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                {data?.channel.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.channel.avatar} alt="" className="h-10 w-10 rounded-full" />
                ) : (
                  <div className="skeleton h-10 w-10 rounded-full" />
                )}
                <div className="min-w-0">
                  <Link
                    href={data ? `/channel/${data.channel.id}` : '#'}
                    className="flex items-center gap-1 text-base font-medium hover:opacity-80"
                  >
                    <span className="truncate">{data?.channel.name ?? '…'}</span>
                    {data?.channel.verified && <VerifiedIcon />}
                  </Link>
                  <p className="text-xs text-yt-sub">{data?.channel.subsText}</p>
                </div>
                <button
                  onClick={() => {
                    if (!data) return;
                    setSubbed(
                      subs.toggleSub({
                        id: data.channel.id,
                        name: data.channel.name,
                        avatar: data.channel.avatar,
                        subsText: data.channel.subsText,
                      })
                    );
                  }}
                  className={`ml-3 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                    subbed ? 'bg-yt-chip hover:bg-[#3f3f3f]' : 'bg-yt-text text-yt-bg hover:bg-white/90'
                  }`}
                >
                  {subbed && <BellIcon className="h-4 w-4" />}
                  {subbed ? 'Đã đăng ký' : 'Đăng ký'}
                </button>
              </div>

              <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
                <div className="flex shrink-0 items-center rounded-full bg-yt-chip">
                  <button
                    onClick={() => data && setLiked(store.toggle('liked', asItem(data)))}
                    className={`flex items-center gap-2 rounded-l-full px-4 py-2 text-sm hover:bg-[#3f3f3f] ${liked ? 'text-yt-blue' : ''}`}
                  >
                    <LikeIcon className="h-5 w-5" />
                    {data?.likes != null ? formatCount(data.likes) : ''}
                  </button>
                  <span className="h-6 w-px bg-white/20" />
                  <button className="rounded-r-full px-4 py-2 hover:bg-[#3f3f3f]">
                    <DislikeIcon className="h-5 w-5" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(`https://youtu.be/${id}`);
                  }}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-yt-chip px-4 py-2 text-sm hover:bg-[#3f3f3f]"
                >
                  <ShareIcon className="h-5 w-5" /> Chia sẻ
                </button>

                <button
                  onClick={() => setSaveOpen(true)}
                  className={`flex shrink-0 items-center gap-2 rounded-full bg-yt-chip px-4 py-2 text-sm hover:bg-[#3f3f3f] ${saved ? 'text-yt-blue' : ''}`}
                >
                  <ClockIcon className="h-5 w-5" /> {saved ? 'Đã lưu' : 'Lưu'}
                </button>

                <button className="shrink-0 rounded-full bg-yt-chip p-2 hover:bg-[#3f3f3f]">
                  <MoreIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {data && (
              <Description
                text={data.description}
                viewsText={data.viewsText}
                publishedText={data.publishedText}
              />
            )}

            {/* chat trực tiếp trên màn hình hẹp */}
            {data?.isLive && (
              <div className="mt-4 h-[420px] xl:hidden">
                <LiveChat videoId={data.id} />
              </div>
            )}

            {/* video liên quan trên mobile */}
            <div className="mt-6 space-y-3 xl:hidden">
              {(related.length ? related : data?.related ?? []).map((v) => (
                <VideoCard key={v.id} v={v} compact />
              ))}
            </div>

            {id && <Comments videoId={id} />}
          </div>
        </div>

        {/* cột phải */}
        {!theater && (
          <aside className="hidden w-[402px] shrink-0 space-y-2 xl:block">
            {data?.isLive && (
              <div className="mb-4 h-[460px]">
                <LiveChat videoId={data.id} />
              </div>
            )}

            <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-sm font-medium">Video đề xuất</p>
              {mix.length > 0 && (
                <p className="text-[11px] text-yt-sub">
                  {mix.map((m) => m.source).join(' · ')}
                </p>
              )}
            </div>

            {(() => {
              const list = related.length ? related : data?.related ?? [];
              if (list.length) return list.map((v) => <VideoCard key={v.id} v={v} compact />);
              if (loadingRelated || !data)
                return Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="skeleton h-[94px] w-[168px] shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="skeleton h-3 w-full rounded" />
                      <div className="skeleton h-3 w-2/3 rounded" />
                    </div>
                  </div>
                ));
              return (
                <p className="rounded-xl bg-yt-elev p-4 text-sm text-yt-sub">
                  Không lấy được video đề xuất cho video này.
                </p>
              );
            })()}
          </aside>
        )}
      </div>

      {saveOpen && data && (
        <SaveToPlaylist
          video={asItem(data)}
          onClose={() => {
            setSaveOpen(false);
            setSaved(store.has('later', data.id));
          }}
        />
      )}
    </div>
  );
}
