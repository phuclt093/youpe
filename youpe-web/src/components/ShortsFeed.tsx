'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { VideoItem } from '@/lib/types';
import { VerifiedIcon, LikeIcon, DislikeIcon, ShareIcon } from './Icons';
import SaveToPlaylist from './SaveToPlaylist';
import * as store from '@/lib/storage';
import { usePlayer } from './PlayerHost';

/**
 * Trang video ngắn kiểu vuốt dọc.
 *
 * Mỗi lần chỉ **một** video được nạp luồng và phát. Đây là điểm khác quan trọng so
 * với feed thường: nạp trước cả trang thì mỗi lần cuộn sẽ kéo theo hàng chục lượt
 * chạy yt-dlp. Ở đây chỉ nạp video đang xem và video kế tiếp.
 *
 * Cuộn được xử lý bằng CSS scroll-snap chứ không tự tính toạ độ — mượt hơn hẳn và
 * giữ được quán tính cuộn tự nhiên của từng hệ điều hành.
 */

type Streams = {
  muxed?: { url: string; height: number | null }[];
  video?: { url: string; height: number | null }[];
  audio?: { url: string }[];
  isLive?: boolean;
  error?: string;
};

const cache = new Map<string, Streams | null>();

async function loadStreams(id: string): Promise<Streams | null> {
  if (cache.has(id)) return cache.get(id)!;
  try {
    const r = await fetch(`/api/streams/${id}`);
    const j = r.ok ? await r.json() : null;
    cache.set(id, j);
    return j;
  } catch {
    cache.set(id, null);
    return null;
  }
}

export default function ShortsFeed() {
  const [items, setItems] = useState<VideoItem[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [muted, setMuted] = useState(true);

  const wrapRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<string[]>([]);

  /*
    Vào trang này là dừng hẳn trình phát chính, kể cả khi nó đang ở cửa sổ nổi.
    Hai video phát cùng lúc thì không nghe được cái nào, và người vào Shorts rõ ràng
    muốn xem Shorts chứ không phải nghe ngầm video cũ.
  */
  const { close } = usePlayer();
  useEffect(() => {
    close();
  }, [close]);

  const fetchMore = useCallback(async () => {
    try {
      const r = await fetch(`/api/shorts?seen=${seenRef.current.slice(-60).join(',')}`);
      const j = await r.json();
      const got: VideoItem[] = j.videos ?? [];

      if (!got.length) {
        setErr(j.error ? 'Không lấy được video ngắn. Thử tải lại trang.' : '');
        return;
      }

      seenRef.current.push(...got.map((v) => v.id));
      setItems((prev) => [...prev, ...got]);
      setErr('');
    } catch {
      setErr('Không kết nối được tới máy chủ.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMore();
  }, [fetchMore]);

  // gần hết danh sách thì lấy thêm
  useEffect(() => {
    if (items.length && active >= items.length - 3) fetchMore();
  }, [active, items.length, fetchMore]);

  /* ---------- theo dõi video nào đang ở giữa màn hình ---------- */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio > 0.6) {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(i)) setActive(i);
          }
        }
      },
      { root: wrap, threshold: [0.6] }
    );

    wrap.querySelectorAll('[data-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  /* ---------- phím mũi tên ---------- */
  const go = useCallback(
    (delta: number) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const next = Math.max(0, Math.min(items.length - 1, active + delta));
      wrap.children[next]?.scrollIntoView({ behavior: 'smooth' });
    },
    [active, items.length]
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'm') {
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [go]);

  if (loading) {
    return (
      <div className="grid h-[calc(100vh-3.5rem)] place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="grid h-[calc(100vh-3.5rem)] place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-medium">Chưa lấy được video ngắn</p>
          <p className="mt-1 text-sm text-yt-sub">{err || 'Thử tải lại trang sau ít phút.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="no-scrollbar h-[calc(100vh-3.5rem)] snap-y snap-mandatory overflow-y-scroll overscroll-contain"
    >
      {items.map((v, i) => (
        <ShortItem
          key={`${v.id}-${i}`}
          v={v}
          index={i}
          // chỉ video đang xem mới phát; video kế tiếp được nạp sẵn luồng
          state={i === active ? 'play' : i === active + 1 ? 'warm' : 'off'}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onEnded={() => go(1)}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ShortItem({
  v,
  index,
  state,
  muted,
  onToggleMute,
  onEnded,
}: {
  v: VideoItem;
  index: number;
  state: 'play' | 'warm' | 'off';
  muted: boolean;
  onToggleMute: () => void;
  onEnded: () => void;
}) {
  const [src, setSrc] = useState<{ video: string; audio?: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  /* ---------- lấy luồng ---------- */
  useEffect(() => {
    if (state === 'off' || src || failed) return;

    let alive = true;
    loadStreams(v.id).then((j) => {
      if (!alive) return;

      if (!j) {
        setFailed(true);
        return;
      }

      // Ưu tiên luồng gộp: một thẻ media là xong, không phải đồng bộ hai thẻ.
      // Shorts đều ngắn và độ phân giải thấp nên luồng gộp gần như luôn có.
      const mux = j.muxed?.[0];
      if (mux?.url) {
        setSrc({ video: mux.url });
        return;
      }

      const vid = [...(j.video ?? [])].sort(
        (a, b) => (a.height ?? 0) - (b.height ?? 0)
      )[0];
      const aud = j.audio?.[0];

      if (vid?.url) setSrc({ video: vid.url, audio: aud?.url });
      else setFailed(true);
    });

    return () => {
      alive = false;
    };
  }, [state, v.id, src, failed]);

  /* ---------- phát / dừng theo vị trí cuộn ---------- */
  useEffect(() => {
    const el = videoRef.current;
    const au = audioRef.current;
    if (!el) return;

    if (state === 'play') {
      el.play().catch(() => {});
      au?.play().catch(() => {});
      setPaused(false);
      store.add('history', v);
    } else {
      el.pause();
      au?.pause();
      el.currentTime = 0;
      if (au) au.currentTime = 0;
    }
  }, [state, src, v]);

  /* ---------- giữ tiếng bám theo hình ---------- */
  useEffect(() => {
    const el = videoRef.current;
    const au = audioRef.current;
    if (!el || !au) return;

    const t = setInterval(() => {
      if (Math.abs(au.currentTime - el.currentTime) > 0.25) au.currentTime = el.currentTime;
    }, 1000);
    return () => clearInterval(t);
  }, [src]);

  const toggle = () => {
    const el = videoRef.current;
    const au = audioRef.current;
    if (!el) return;

    if (el.paused) {
      el.play().catch(() => {});
      au?.play().catch(() => {});
      setPaused(false);
    } else {
      el.pause();
      au?.pause();
      setPaused(true);
    }
  };

  return (
    <section
      data-index={index}
      className="flex h-full snap-start snap-always items-center justify-center py-2"
    >
      <div className="relative flex h-full max-h-[calc(100vh-4.5rem)] items-center gap-4">
        {/* khung video dọc 9:16 */}
        <div className="relative h-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '9 / 16' }}>
          {src ? (
            <>
              <video
                ref={videoRef}
                src={src.video}
                poster={v.thumbnail}
                muted={muted || !!src.audio}
                loop={false}
                playsInline
                disablePictureInPicture
                onClick={toggle}
                onEnded={onEnded}
                onTimeUpdate={(e) => {
                  const el = e.currentTarget;
                  if (el.duration) setProgress(el.currentTime / el.duration);
                }}
                className="h-full w-full cursor-pointer object-contain"
              />
              {src.audio && (
                <audio ref={audioRef} src={src.audio} muted={muted} preload="auto" />
              )}
            </>
          ) : (
            <div className="grid h-full w-full place-items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
              {failed ? (
                <p className="relative px-6 text-center text-sm text-yt-sub">
                  Video này không phát được
                </p>
              ) : (
                <div className="relative h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              )}
            </div>
          )}

          {/* vạch tiến độ */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
            <div className="h-full bg-yt-red" style={{ width: `${progress * 100}%` }} />
          </div>

          {paused && (
            <button
              onClick={toggle}
              aria-label="Phát"
              className="absolute inset-0 grid place-items-center bg-black/20"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full bg-black/60">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )}

          <button
            onClick={onToggleMute}
            title={muted ? 'Bật tiếng (M)' : 'Tắt tiếng (M)'}
            aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
            className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 hover:bg-black/80"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              {muted ? (
                <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.94 8.94 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              ) : (
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              )}
            </svg>
          </button>

          {/* thông tin đè lên đáy video */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pb-5">
            <p className="line-clamp-2 text-sm font-medium">{v.title}</p>
            {v.author.name && (
              <Link
                href={v.author.id ? `/channel/${v.author.id}` : '#'}
                className="pointer-events-auto mt-1.5 inline-flex items-center gap-1.5 text-xs text-white/85 hover:text-white"
              >
                {v.author.avatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.author.avatar} alt="" className="h-6 w-6 rounded-full" />
                )}
                {v.author.name}
                {v.author.verified && <VerifiedIcon className="h-3 w-3" />}
              </Link>
            )}
            {v.viewsText && <p className="mt-1 text-[11px] text-white/60">{v.viewsText}</p>}
          </div>
        </div>

        {/* cột nút bên phải, giống YouTube */}
        <div className="flex flex-col gap-4 pb-8">
          <SideBtn label="Thích"><LikeIcon className="h-6 w-6" /></SideBtn>
          <SideBtn label="Không thích"><DislikeIcon className="h-6 w-6" /></SideBtn>
          <SideBtn
            label="Chia sẻ"
            onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/watch?v=${v.id}`).catch(() => {});
            }}
          >
            <ShareIcon className="h-6 w-6" />
          </SideBtn>

          <SideBtn label="Lưu vào danh sách" onClick={() => setSaveOpen(true)}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M22 13h-4v4h-2v-4h-4v-2h4V7h2v4h4v2zM14 7H2v1h12V7zm0 4H2v1h12v-1zM2 16h8v-1H2v1z" />
            </svg>
          </SideBtn>

          <Link
            href={`/watch?v=${v.id}`}
            title="Mở ở trang xem đầy đủ"
            className="grid h-10 w-10 place-items-center rounded-full bg-yt-elev hover:bg-yt-hover"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M4 4h7v2H6v5H4V4zm16 0v7h-2V6h-5V4h7zM4 20v-7h2v5h5v2H4zm16 0h-7v-2h5v-5h2v7z" />
            </svg>
          </Link>
        </div>
      </div>

      {saveOpen && <SaveToPlaylist video={v} onClose={() => setSaveOpen(false)} />}
    </section>
  );
}

function SideBtn({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full bg-yt-elev transition hover:bg-yt-hover"
    >
      {children}
    </button>
  );
}
