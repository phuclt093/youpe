'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PlayerSlot, usePlayer } from '@/components/PlayerHost';
import Comments from '@/components/Comments';
import VideoCard from '@/components/VideoCard';
import { LikeIcon, DislikeIcon, ShareIcon, ClockIcon, VerifiedIcon, MoreIcon } from '@/components/Icons';
import { formatCount, viPublished } from '@/lib/format';
import * as store from '@/lib/storage';
import { prefetchNow } from '@/lib/prefetch';
import SaveToPlaylist from '@/components/SaveToPlaylist';
import LiveChat from '@/components/LiveChat';
import Description from '@/components/Description';
import SubscribeButton from '@/components/SubscribeButton';
import PlaylistPanel, { biliSeasonList, recoverListFor, usePlaylistQueue } from '@/components/PlaylistPanel';
import type { VideoDetail, VideoItem } from '@/lib/types';

export default function WatchPage() {
  const id = useSearchParams().get('v') ?? '';
  const router = useRouter();
  const [data, setData] = useState<VideoDetail | null>(null);
  const [err, setErr] = useState('');
  const [theater, setTheater] = useState(false);
  const { play, current: playing, close: closePlayer } = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [related, setRelated] = useState<VideoItem[]>([]);
  const [mix, setMix] = useState<{ source: string; count: number }[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  /** Thông tin trận đấu Xoilac, làm mới định kỳ để tỉ số không đứng yên */
  const [match, setMatch] = useState<any>(null);

  const searchParams = useSearchParams();
  const sourceParam = searchParams.get('source');
  /*
    ?list=... → đang xem trong một danh sách phát.

    Đường dẫn không có `list` thì hỏi lại danh sách vừa mở gần nhất: video này vẫn
    nằm trong đó thì coi như chưa rời danh sách. Nhờ vậy bấm Back, hay bấm một video
    trong phần gợi ý mà nó có sẵn trong danh sách, hàng chờ vẫn còn nguyên.
  */
  const [recovered, setRecovered] = useState('');
  useEffect(() => {
    setRecovered(searchParams.get('list') ? '' : recoverListFor(id));
  }, [id, searchParams]);

  // Tập phim Bilibili: tự hiện các tập còn lại của phần đó, như trên bilibili.tv
  const listId = searchParams.get('list') || recovered || biliSeasonList(id);
  const queue = usePlaylistQueue(listId);
  const isXoilac = id.startsWith('xl_') || sourceParam === 'xoilac';

  useEffect(() => {
    if (!id) return;
    setData(null);
    setErr('');

    if (isXoilac) {
      fetch(`/api/xoilac/stream?matchId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((j) => {
          if (!j.success || !j.match) {
            setErr(j.error || 'Không tìm thấy thông tin trận đấu Xoilac');
            return;
          }
          const m = j.match;
          setMatch(m);
          setData({
            id: m.id,
            title: `${m.homeTeam.name} vs ${m.awayTeam.name} · ${m.league}`,
            description: `Trực tiếp trận đấu ${m.title} thuộc giải ${m.league}.\nTrạng thái: ${m.matchTime}.\nTỷ số hiện tại: ${m.score}.\nBình luận viên: ${m.commentator || 'Xoilac TV'}.`,
            views: null,
            viewsText: m.matchTime,
            likes: null,
            likesText: 'Yêu thích',
            publishedText: m.league,
            isLive: true,
            durationSec: null,
            keywords: ['xoilac', 'bóng đá', m.homeTeam.name, m.awayTeam.name],
            channel: {
              id: 'xoilac_tv',
              name: 'Xôi Lạc TV · Trực Tiếp Bóng Đá',
              avatar: m.homeTeam.logo || m.thumbnail || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop&q=80',
              subsText: m.commentator ? `🎙️ ${m.commentator}` : 'Trực tiếp chất lượng cao',
              verified: true,
            },
            related: [],
            manifest: '',
            manifestType: 'hls',
            captions: [],
            storyboard: null,
          });
        })
        .catch((e) => setErr(String(e)));
    } else if (/^bili_p_\d+$/.test(id)) {
      /*
        Đường dẫn tới cả một phần phim Bilibili, chưa chọn tập (thẻ kết quả tìm kiếm
        hay trỏ kiểu này). yt-dlp gặp nó sẽ trả về danh sách chứ không phải video,
        nên tra danh sách tập rồi chuyển thẳng sang tập đầu.
      */
      const season = id.slice(7);
      fetch(`/api/bili/season/${season}`)
        .then((r) => r.json())
        .then((j) => {
          const first = j.episodes?.[0]?.id;
          if (first) router.replace(`/watch?v=${first}&list=bili:${season}`);
          else setErr('Không lấy được danh sách tập của phần phim này.');
        })
        .catch((e) => setErr(String(e)));
    } else {
      fetch(`/api/video/${id}`)
        .then((r) => r.json())
        .then((j) => (j.error ? setErr(j.error) : setData(j)))
        .catch((e) => setErr(String(e)));
    }
  }, [id, isXoilac]);

  /*
    Trong danh sách phát thì "video tiếp theo" phải là video kế nó trong danh sách,
    không phải video đề xuất — đó mới là điều người xem chờ đợi khi bấm Phát tất cả.
  */
  const upNext: VideoItem[] = (() => {
    if (!queue?.videos.length) return [];
    const i = queue.videos.findIndex((v) => v.id === id);
    if (i < 0) return queue.videos.filter((v) => v.id !== id);
    return queue.videos.slice(i + 1);
  })();

  const playerList = upNext.length ? upNext : related.length ? related : data?.related ?? [];

  /*
    Tỉ số và phút thi đấu lấy một lần lúc mở trang thì đứng yên suốt trận. Hỏi lại
    mỗi 30 giây — chỉ dữ liệu trận, không đụng tới luồng đang phát.
  */
  useEffect(() => {
    if (!isXoilac || !id) return;
    const tick = () => {
      fetch(`/api/xoilac/stream?matchId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((j) => j?.match && setMatch(j.match))
        .catch(() => {});
    };
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [isXoilac, id]);

  // đưa video cho trình phát dùng chung — nó sống ngoài cây trang nên
  // chuyển trang không làm video nạp lại
  useEffect(() => {
    if (!data) return;
    play({
      videoId: data.id,
      title: data.title,
      channelName: data.channel.name,
      poster: data.thumbnail || `https://i.ytimg.com/vi/${data.id}/maxresdefault.jpg`,
      captions: data.captions,
      listId: listId || undefined,
      related: playerList.map((v) => ({
        id: v.id,
        title: v.title,
        thumbnail: v.thumbnail,
        durationText: v.durationText,
        author: { name: v.author.name },
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, related, play, listId, queue?.videos]);

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
      thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
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
  }, [data]);

  // Đang xem thì âm thầm lấy sẵn luồng của video kế tiếp — bấm sang là phát ngay.
  // Hoãn 4 giây để không tranh băng thông với video đang chạy.
  useEffect(() => {
    const next = playerList[0]?.id;
    if (!next) return;
    const t = setTimeout(() => prefetchNow(next), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerList[0]?.id]);

  const asItem = (d: VideoDetail): VideoItem => ({
    id: d.id,
    title: d.title,
    thumbnail: d.thumbnail || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
    durationSec: d.durationSec,
    durationText: '',
    viewsText: d.viewsText,
    publishedText: d.publishedText,
    isLive: d.isLive,
    author: { id: d.channel.id, name: d.channel.name, avatar: d.channel.avatar, verified: d.channel.verified },
  });

  /*
    Mở video mới mà hỏng thì dừng video cũ đang chạy ở khung nhỏ.

    Trước đây bấm sang tập 8 (cần đăng nhập) thì trang báo lỗi, còn tập 3 vừa xem
    vẫn phát tiếp ở góc — nhìn như app đang phát nhầm tập. Người xem đã bấm sang
    video khác tức là muốn bỏ video cũ, y như YouTube.
  */
  useEffect(() => {
    if (err && playing && playing.videoId !== id) closePlayer();
  }, [err, playing, id, closePlayer]);

  const needsBiliLogin = err.includes('BILI_LOGIN');
  const errText = err.replace(/^(yt-dlp:\s*)?BILI_LOGIN\s*/, '');

  if (!id) return <p className="p-10 text-center text-yt-sub">Thiếu ID video.</p>;

  return (
    <div className={`mx-auto px-4 pb-16 pt-6 ${theater ? 'max-w-none px-0' : 'max-w-[1754px] lg:px-6'}`}>
      <div className={theater ? '' : 'flex flex-col gap-6 xl:flex-row'}>
        {/* cột chính */}
        <div className={theater ? '' : 'min-w-0 flex-1 xl:max-w-[1280px]'}>
          {err ? (
            <div className="aspect-video grid place-items-center rounded-xl bg-yt-elev px-6 text-center">
              <div className="max-w-lg">
                <p className="text-sm text-yt-sub">
                  {needsBiliLogin ? errText : `Không phát được video: ${errText}`}
                </p>
                {needsBiliLogin && (
                  <Link
                    href="/bili?setup=1"
                    className="mt-4 inline-block rounded-full bg-yt-text px-4 py-2 text-sm font-medium text-yt-bg hover:bg-yt-text/90"
                  >
                    Xem cách đăng nhập Bilibili
                  </Link>
                )}
              </div>
            </div>
          ) : data ? (
            <PlayerSlot />
          ) : (
            <div className="skeleton aspect-video w-full rounded-xl" />
          )}

          <div className={theater ? 'mx-auto max-w-[1280px] px-4 lg:px-6' : ''}>
            {match && <Scoreboard m={match} />}

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
                <SubscribeButton
                  className="ml-3 shrink-0"
                  showBell
                  channel={
                    data && {
                      id: data.channel.id,
                      name: data.channel.name,
                      avatar: data.channel.avatar,
                      subsText: data.channel.subsText,
                    }
                  }
                />
              </div>

              <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
                <div className="flex shrink-0 items-center rounded-full bg-yt-chip">
                  <button
                    onClick={() => data && setLiked(store.toggle('liked', asItem(data)))}
                    className={`flex items-center gap-2 rounded-l-full px-4 py-2 text-sm hover:bg-yt-chip2 ${liked ? 'text-yt-blue' : ''}`}
                  >
                    <LikeIcon className="h-5 w-5" />
                    {data?.likes != null ? formatCount(data.likes) : ''}
                  </button>
                  <span className="h-6 w-px bg-yt-text/20" />
                  <button className="rounded-r-full px-4 py-2 hover:bg-yt-chip2">
                    <DislikeIcon className="h-5 w-5" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(`https://youtu.be/${id}`);
                  }}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-yt-chip px-4 py-2 text-sm hover:bg-yt-chip2"
                >
                  <ShareIcon className="h-5 w-5" /> Chia sẻ
                </button>

                <button
                  onClick={() => setSaveOpen(true)}
                  className={`flex shrink-0 items-center gap-2 rounded-full bg-yt-chip px-4 py-2 text-sm hover:bg-yt-chip2 ${saved ? 'text-yt-blue' : ''}`}
                >
                  <ClockIcon className="h-5 w-5" /> {saved ? 'Đã lưu' : 'Lưu'}
                </button>

                <button className="shrink-0 rounded-full bg-yt-chip p-2 hover:bg-yt-chip2">
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
            <div className="mt-6 xl:hidden">
              {queue && <PlaylistPanel queue={queue} currentId={id} />}
            </div>

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

            {queue && <PlaylistPanel queue={queue} currentId={id} />}

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

/**
 * Bảng tỉ số cho trận đang xem ở mục Bóng đá.
 *
 * Trước đây mọi thứ bị nhồi vào tiêu đề video thành một dòng dài loằng ngoằng —
 * tên hai đội, tỉ số, giải đấu. Tách ra thành bảng thì liếc một cái là thấy.
 */
function Scoreboard({ m }: { m: any }) {
  const live = m.status === 'live';

  return (
    <div className="mt-3 flex items-center gap-4 rounded-xl bg-yt-elev px-4 py-3">
      <Side name={m.homeTeam?.name} logo={m.homeTeam?.logo} align="right" />

      <div className="shrink-0 text-center">
        <p className="text-2xl font-bold tabular-nums">{m.score || 'vs'}</p>
        <p className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] text-yt-sub">
          {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yt-red" />}
          {m.matchTime}
        </p>
      </div>

      <Side name={m.awayTeam?.name} logo={m.awayTeam?.logo} align="left" />

      <div className="hidden min-w-0 shrink-0 border-l border-yt-border pl-4 text-xs text-yt-sub sm:block">
        <p className="truncate font-medium text-yt-text">{m.league}</p>
        {m.commentator && <p className="truncate">BLV {m.commentator}</p>}
      </div>
    </div>
  );
}

function Side({ name, logo, align }: { name?: string; logo?: string; align: 'left' | 'right' }) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-3 ${
        align === 'right' ? 'flex-row-reverse text-right' : 'text-left'
      }`}
    >
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      )}
      <span className="truncate text-sm font-medium">{name}</span>
    </div>
  );
}
