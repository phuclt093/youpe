'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Thumb } from '@/components/VideoCard';
import { viPublished } from '@/lib/format';
import { CloseIcon, PlaylistIcon, VerifiedIcon } from '@/components/Icons';
import EmptyState from '@/components/EmptyState';
import SubscribeButton from '@/components/SubscribeButton';
import { cancelPrefetch, prefetchNow, prefetchOnHover } from '@/lib/prefetch';
import type { VideoItem, ChannelItem, PlaylistItem } from '@/lib/types';

/* ------------------------------------------------------------------ */
/* Bộ lọc — cùng cấu trúc với hộp "Bộ lọc tìm kiếm" của YouTube         */
/* ------------------------------------------------------------------ */

type Key = 'type' | 'duration' | 'date' | 'features' | 'sort';
type Opt = { value: string; label: string };

const GROUPS: { key: Key; title: string; multi?: boolean; options: Opt[] }[] = [
  {
    key: 'type',
    title: 'Loại',
    options: [
      { value: 'video', label: 'Video' },
      { value: 'shorts', label: 'Shorts' },
      { value: 'channel', label: 'Kênh' },
      { value: 'playlist', label: 'Danh sách phát' },
      { value: 'movie', label: 'Phim' },
    ],
  },
  {
    key: 'duration',
    title: 'Thời lượng',
    options: [
      { value: 'under_three_mins', label: 'Dưới 3 phút' },
      { value: 'three_to_twenty_mins', label: 'Từ 3 đến 20 phút' },
      { value: 'over_twenty_mins', label: 'Trên 20 phút' },
    ],
  },
  {
    key: 'date',
    title: 'Ngày tải lên',
    options: [
      { value: 'today', label: 'Hôm nay' },
      { value: 'week', label: 'Tuần này' },
      { value: 'month', label: 'Tháng này' },
      { value: 'year', label: 'Năm nay' },
    ],
  },
  {
    key: 'features',
    title: 'Tính năng',
    multi: true,
    options: [
      { value: 'live', label: 'Trực tiếp' },
      { value: '4k', label: '4K' },
      { value: 'hd', label: 'HD' },
      { value: 'subtitles', label: 'Phụ đề' },
      { value: 'creative_commons', label: 'Creative Commons' },
      { value: '360', label: '360°' },
      { value: 'vr180', label: 'VR180' },
      { value: '3d', label: '3D' },
      { value: 'hdr', label: 'HDR' },
    ],
  },
  {
    key: 'sort',
    title: 'Ưu tiên',
    options: [
      { value: '', label: 'Mức độ liên quan' },
      { value: 'popularity', label: 'Mức độ phổ biến' },
    ],
  },
];

/** Các chip nhanh phía trên — mỗi chip là một bộ tham số đặt sẵn */
const CHIPS: { label: string; params: Partial<Record<Key, string>> }[] = [
  { label: 'Tất cả', params: {} },
  { label: 'Video', params: { type: 'video' } },
  { label: 'Shorts', params: { type: 'shorts' } },
  { label: 'Tải lên gần đây', params: { date: 'week' } },
  { label: 'Trực tiếp', params: { features: 'live' } },
  { label: 'Kênh', params: { type: 'channel' } },
  { label: 'Danh sách phát', params: { type: 'playlist' } },
];

const KEYS: Key[] = ['type', 'duration', 'date', 'features', 'sort'];

/* ------------------------------------------------------------------ */

export default function ResultsPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = sp.get('q') ?? '';

  // Bộ lọc nằm trên URL: bấm Back quay lại đúng bộ lọc cũ, gửi link cho người khác cũng giữ nguyên
  const current = useMemo(() => {
    const o = {} as Record<Key, string>;
    for (const k of KEYS) o[k] = sp.get(k) ?? '';
    // tham số cũ ?filter=video vẫn dùng được
    if (!o.type && sp.get('filter') && sp.get('filter') !== 'all') o.type = sp.get('filter')!;
    return o;
  }, [sp]);

  const activeCount = KEYS.filter((k) => current[k]).length;

  const [panel, setPanel] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const apply = (next: Partial<Record<Key, string>>, replaceAll = false) => {
    const p = new URLSearchParams();
    p.set('q', q);
    const merged = replaceAll ? next : { ...current, ...next };
    for (const k of KEYS) if (merged[k]) p.set(k, merged[k]!);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const toggle = (key: Key, value: string, multi?: boolean) => {
    if (multi) {
      const set = new Set(current[key].split(',').filter(Boolean));
      if (set.has(value)) set.delete(value);
      else set.add(value);
      apply({ [key]: [...set].join(',') });
    } else {
      apply({ [key]: current[key] === value ? '' : value });
    }
  };

  const isOn = (key: Key, value: string, multi?: boolean) =>
    multi ? current[key].split(',').includes(value) : current[key] === value;

  const chipActive = (params: Partial<Record<Key, string>>) =>
    KEYS.every((k) => (params[k] ?? '') === current[k]);

  const queryString = KEYS.map((k) => `${k}=${encodeURIComponent(current[k])}`).join('&');

  useEffect(() => {
    if (!q) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}&${queryString}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setVideos(j.videos ?? []);
        setChannels(j.channels ?? []);
        setPlaylists(j.playlists ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setVideos([]);
        setChannels([]);
        setPlaylists([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q, queryString]);

  // Esc đóng hộp bộ lọc
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  // Playlist chen vào giữa danh sách video (sau video thứ 3) thay vì dồn một chỗ
  const rows = useMemo(() => {
    type Row = { kind: 'video'; v: VideoItem } | { kind: 'playlist'; p: PlaylistItem };
    const out: Row[] = videos.map((v) => ({ kind: 'video', v }));
    const pls: Row[] = playlists.map((p) => ({ kind: 'playlist', p }));
    if (!out.length) return pls;
    pls.forEach((r, i) => out.splice(Math.min(out.length, 3 + i * 5), 0, r));
    return out;
  }, [videos, playlists]);

  const empty = !loading && !videos.length && !channels.length && !playlists.length;

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-4 sm:px-6">
      {/* ---- chip + nút Bộ lọc ---- */}
      <div className="mb-5 flex items-center gap-3">
        <div className="no-scrollbar flex min-w-0 flex-1 gap-3 overflow-x-auto">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              onClick={() => apply(c.params, true)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                chipActive(c.params) ? 'bg-yt-text text-yt-bg' : 'bg-yt-chip hover:bg-yt-chip2'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setPanel(true)}
          className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-yt-hover"
        >
          Bộ lọc
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-yt-text px-1 text-[11px] text-yt-bg">
              {activeCount}
            </span>
          )}
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M15 17h6v1h-6v-1zm-4 0H3v1h8v2h1v-5h-1v2zm3-9h1V3h-1v2H3v1h11v2zm4-3v1h3V5h-3zM6 14h1V9H6v2H3v1h3v2zm4-2h11v-1H10v1z" />
          </svg>
        </button>
      </div>

      {/* ---- hộp bộ lọc ---- */}
      {panel && (
        <div
          className="anim-fade-in fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setPanel(false)}
        >
          <div
            role="dialog"
            aria-label="Bộ lọc tìm kiếm"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-[720px] overflow-y-auto rounded-xl bg-yt-elev p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-medium">Bộ lọc tìm kiếm</h2>
              <div className="flex items-center gap-2">
                {activeCount > 0 && (
                  <button
                    onClick={() => apply({}, true)}
                    className="rounded-full px-3 py-1.5 text-sm text-yt-blue hover:bg-yt-hover"
                  >
                    Xoá bộ lọc
                  </button>
                )}
                <button
                  onClick={() => setPanel(false)}
                  aria-label="Đóng"
                  className="grid h-9 w-9 place-items-center rounded-full hover:bg-yt-hover"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 md:grid-cols-5">
              {GROUPS.map((g) => (
                <div key={g.key}>
                  <p className="border-b border-yt-border pb-3 text-xs font-medium uppercase tracking-wide">
                    {g.title}
                  </p>
                  <ul className="mt-2">
                    {g.options.map((o) => {
                      const on =
                        o.value === '' ? !current[g.key] : isOn(g.key, o.value, g.multi);
                      return (
                        <li key={o.value || 'default'}>
                          <button
                            onClick={() => toggle(g.key, o.value, g.multi)}
                            className={`flex w-full items-center justify-between gap-2 py-2 text-left text-sm ${
                              on ? 'font-medium text-yt-text' : 'text-yt-sub hover:text-yt-text'
                            }`}
                          >
                            <span>{o.label}</span>
                            {on && o.value !== '' && <CloseIcon className="h-3.5 w-3.5 shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- đang tải ---- */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-4 sm:flex-row">
              <div className="skeleton aspect-video w-full shrink-0 rounded-xl sm:w-[360px] xl:w-[480px]" />
              <div className="flex-1 space-y-3 pt-1">
                <div className="skeleton h-5 w-4/5 rounded" />
                <div className="skeleton h-3 w-1/3 rounded" />
                <div className="skeleton h-6 w-1/4 rounded-full" />
                <div className="skeleton h-3 w-3/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- kênh ---- */}
      {!loading &&
        channels.map((c) => (
          <div key={c.id} className="mb-6 flex items-center gap-4 border-b border-yt-border pb-6 sm:gap-6">
            <Link href={`/channel/${c.id}`} className="flex w-[96px] shrink-0 justify-center sm:w-[360px] xl:w-[480px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.avatar} alt="" className="h-[96px] w-[96px] rounded-full object-cover sm:h-[136px] sm:w-[136px]" />
            </Link>

            <div className="min-w-0 flex-1">
              <Link href={`/channel/${c.id}`} className="flex items-center gap-1.5 text-lg hover:underline">
                {c.name}
                {c.verified && <VerifiedIcon className="h-4 w-4 shrink-0 text-yt-sub" />}
              </Link>
              <p className="mt-1 text-xs text-yt-sub">
                {c.subsText}
                {c.subsText && c.videoCountText && c.videoCountText !== c.subsText ? ' • ' : ''}
                {c.videoCountText !== c.subsText ? c.videoCountText : ''}
              </p>
            </div>

            <SubscribeButton channel={c} className="shrink-0" showBell />
          </div>
        ))}

      {/* ---- video + danh sách phát ---- */}
      <div className="space-y-4">
        {!loading &&
          rows.map((r, i) =>
            r.kind === 'video' ? (
              <VideoRow key={r.v.id} v={r.v} q={q} index={i} />
            ) : (
              <PlaylistRow key={r.p.id} p={r.p} index={i} />
            )
          )}
      </div>

      {empty && (
        <EmptyState
          title={`Không có kết quả cho "${q}"`}
          hint={activeCount ? 'Thử bỏ bớt bộ lọc, hoặc dùng từ khoá ngắn hơn.' : 'Thử từ khoá ngắn hơn, hoặc bỏ bớt dấu.'}
          actionLabel={activeCount ? 'Xoá bộ lọc' : 'Về trang chủ'}
          actionHref={activeCount ? `/results?q=${encodeURIComponent(q)}` : '/'}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** In đậm các từ trong câu tìm kiếm, giống đoạn mô tả trên YouTube */
function Highlight({ text, q }: { text: string; q: string }) {
  const words = q
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <b key={i} className="font-medium text-yt-text">
            {part}
          </b>
        ) : (
          part
        )
      )}
    </>
  );
}

function VideoRow({ v, q, index }: { v: VideoItem; q: string; index: number }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={`/watch?v=${v.id}`}
      onMouseEnter={() => {
        setHover(true);
        prefetchOnHover(v.id);
      }}
      onMouseLeave={() => {
        setHover(false);
        cancelPrefetch(v.id);
      }}
      onMouseDown={() => prefetchNow(v.id)}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className="anim-fade-up group flex flex-col gap-3 sm:flex-row sm:gap-4"
    >
      <div className="w-full shrink-0 sm:w-[360px] xl:w-[480px]">
        <Thumb v={v} hovered={hover} />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-lg leading-[26px]">{v.title}</h3>
        <p className="mt-1 text-xs text-yt-sub">
          {v.viewsText}
          {v.viewsText && v.publishedText ? ' • ' : ''}
          {viPublished(v.publishedText)}
        </p>

        {v.author.name && (
          <div className="my-3 flex items-center gap-2 text-xs text-yt-sub">
            {v.author.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.author.avatar} alt="" className="h-6 w-6 rounded-full" />
            )}
            <span className="hover:text-yt-text">{v.author.name}</span>
            {v.author.verified && <VerifiedIcon />}
          </div>
        )}

        {v.description && (
          <p className="line-clamp-2 hidden text-xs leading-[18px] text-yt-sub sm:block">
            <Highlight text={v.description} q={q} />
          </p>
        )}

        {(v.isLive || v.badges?.length) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {v.isLive && (
              <span className="rounded bg-yt-red px-1.5 py-0.5 text-[11px] font-medium text-white">
                TRỰC TIẾP
              </span>
            )}
            {v.badges
              ?.filter((b) => !(v.isLive && /live|trực tiếp/i.test(b)))
              .map((b) => (
                <span key={b} className="rounded bg-yt-chip px-1.5 py-0.5 text-[11px] font-medium text-yt-sub">
                  {b}
                </span>
              ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function PlaylistRow({ p, index }: { p: PlaylistItem; index: number }) {
  return (
    <Link
      href={`/list/${p.id}`}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className="anim-fade-up group flex flex-col gap-3 sm:flex-row sm:gap-4"
    >
      <div className="relative w-full shrink-0 pt-2 sm:w-[360px] xl:w-[480px]">
        {/* hai lớp phía sau tạo cảm giác "một chồng video" như YouTube */}
        <div className="absolute inset-x-6 top-0 h-4 rounded-t-xl bg-yt-chip2/60" />
        <div className="absolute inset-x-3 top-1 h-4 rounded-t-xl bg-yt-chip2" />
        <div className="relative aspect-video overflow-hidden rounded-xl bg-yt-elev">
          {p.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-yt-sub">
              <PlaylistIcon className="h-8 w-8" />
            </div>
          )}
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
            <PlaylistIcon className="h-3.5 w-3.5" />
            {p.videoCount || 'Danh sách phát'}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-lg leading-[26px]">{p.title}</h3>
        <p className="mt-1 text-xs text-yt-sub">
          {p.author ? `${p.author} • ` : ''}Danh sách phát
        </p>
        <p className="mt-3 text-xs font-medium text-yt-sub group-hover:text-yt-text">
          Xem toàn bộ danh sách phát
        </p>
      </div>
    </Link>
  );
}
