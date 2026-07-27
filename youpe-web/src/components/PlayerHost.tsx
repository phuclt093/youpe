'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Player, { type EndCardItem } from './Player';
import { CloseIcon } from './Icons';
import { getPrefs } from '@/lib/prefs';

/**
 * Trình phát dùng chung cho cả app.
 *
 * Vấn đề cần giải: muốn xem tiếp trong khung nhỏ khi rời trang xem, thì thẻ `<video>`
 * **không được unmount**. Nếu để trình phát nằm trong cây của trang xem, chuyển trang
 * là React gỡ nó đi và video nạp lại từ đầu.
 *
 * Cách làm: tạo một thẻ div nằm ngoài React ngay trong `document.body`, rồi dùng
 * `createPortal` để render trình phát vào đó. Vì mục tiêu portal không đổi, React
 * không bao giờ unmount. Khi cần đổi vị trí, ta **di chuyển chính thẻ div đó** bằng
 * `appendChild` — trình duyệt coi đây là thao tác chuyển chỗ chứ không phải xoá rồi
 * tạo lại, nên video chạy liên tục.
 */

export type PlayingVideo = {
  videoId: string;
  title: string;
  channelName: string;
  poster?: string;
  captions?: { label: string; lang: string; url: string }[];
  related: EndCardItem[];
};

type Mode = 'full' | 'mini';

type Ctx = {
  current: PlayingVideo | null;
  mode: Mode;
  play: (v: PlayingVideo) => void;
  setMode: (m: Mode) => void;
  close: () => void;
  registerSlot: (el: HTMLDivElement | null) => void;
  /** Tua trình phát tới giây thứ t — dùng cho mốc thời gian trong mô tả */
  seek: (t: number) => void;
};

const PlayerCtx = createContext<Ctx>({
  current: null,
  mode: 'full',
  play: () => {},
  setMode: () => {},
  close: () => {},
  registerSlot: () => {},
  seek: () => {},
});

export const usePlayer = () => useContext(PlayerCtx);

/* ---------------- vị trí và kích thước cửa sổ nhỏ ---------------- */

const BOX_KEY = 'youpe.miniBox';
const MIN_W = 280;
const MAX_W = 900;
const MARGIN = 12;

type Box = { x: number; y: number; w: number };

function defaultBox(): Box {
  const w = 400;
  return {
    w,
    x: Math.max(MARGIN, window.innerWidth - w - MARGIN),
    y: Math.max(MARGIN, window.innerHeight - (w * 9) / 16 - 90),
  };
}

function loadBox(): Box {
  try {
    const raw = localStorage.getItem(BOX_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* dữ liệu hỏng thì dùng mặc định */
  }
  return defaultBox();
}

/** Không cho cửa sổ trôi ra ngoài màn hình, kể cả sau khi đổi cỡ cửa sổ trình duyệt */
function clampBox(b: Box): Box {
  const w = Math.min(Math.max(b.w, MIN_W), Math.min(MAX_W, window.innerWidth - MARGIN * 2));
  const h = (w * 9) / 16 + 44; // 44 là chiều cao thanh tiêu đề
  return {
    w,
    x: Math.min(Math.max(b.x, MARGIN), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
    y: Math.min(Math.max(b.y, MARGIN), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
  };
}

export default function PlayerHost({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState<PlayingVideo | null>(null);
  const [mode, setModeRaw] = useState<Mode>('full');
  const [theater, setTheater] = useState(false);
  const [box, setBox] = useState<Box | null>(null);

  const slotRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<{ seek: (t: number) => void } | null>(null);
  /** Người dùng tự bấm thu nhỏ thì giữ nguyên ý muốn đó, kể cả khi đang ở trang xem */
  const userChose = useRef(false);

  /* ---------- tạo thẻ chứa, một lần duy nhất ---------- */
  useEffect(() => {
    const el = document.createElement('div');
    el.id = 'youpe-player-host';
    document.body.appendChild(el);
    setHost(el);
    setBox(clampBox(loadBox()));

    return () => {
      el.remove();
    };
  }, []);

  /* ---------- di chuyển thẻ chứa khi đổi chế độ ---------- */
  const place = useCallback(() => {
    if (!host) return;

    if (mode === 'full' && slotRef.current) {
      host.removeAttribute('style');
      host.className = 'w-full';
      if (host.parentElement !== slotRef.current) slotRef.current.appendChild(host);
      return;
    }

    const b = box ?? clampBox(defaultBox());
    host.className =
      'fixed z-[120] overflow-hidden rounded-xl bg-yt-bg shadow-2xl ring-1 ring-white/10';
    host.style.left = `${b.x}px`;
    host.style.top = `${b.y}px`;
    host.style.width = `${b.w}px`;
    if (host.parentElement !== document.body) document.body.appendChild(host);
  }, [host, mode, box]);

  useEffect(place, [place, current]);

  // Esc đóng cửa sổ nhỏ
  useEffect(() => {
    if (mode !== 'mini') return;
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') setCurrent(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [mode]);

  // đổi cỡ cửa sổ trình duyệt thì kéo cửa sổ nhỏ về trong màn hình
  useEffect(() => {
    const h = () => setBox((b) => (b ? clampBox(b) : b));
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const setMode = useCallback((m: Mode) => {
    userChose.current = m === 'mini';
    setModeRaw(m);
  }, []);

  const registerSlot = useCallback(
    (el: HTMLDivElement | null) => {
      slotRef.current = el;

      if (!el && current) {
        // rời trang xem: thu nhỏ thay vì dừng hẳn
        if (getPrefs().miniOnLeave) setModeRaw('mini');
        else setCurrent(null);
      } else if (el && !userChose.current) {
        setModeRaw('full');
      }

      // hoãn một nhịp để chờ DOM của trang mới dựng xong
      requestAnimationFrame(place);
    },
    [current, place]
  );

  const play = useCallback((v: PlayingVideo) => {
    setCurrent((prev) => (prev?.videoId === v.videoId ? { ...prev, ...v } : v));
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    userChose.current = false;
    setModeRaw('full');
  }, []);

  const expand = useCallback(() => {
    userChose.current = false;
    setModeRaw('full');
    if (current) router.push(`/watch?v=${current.videoId}`);
  }, [current, router]);

  /* ---------- kéo thả và đổi cỡ ---------- */

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!box) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...box };

      const move = (ev: PointerEvent) => {
        setBox(
          clampBox({
            ...origin,
            x: origin.x + (ev.clientX - startX),
            y: origin.y + (ev.clientY - startY),
          })
        );
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setBox((b) => {
          if (b) localStorage.setItem(BOX_KEY, JSON.stringify(b));
          return b;
        });
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [box]
  );

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      if (!box) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const origin = { ...box };

      const move = (ev: PointerEvent) => {
        // kéo sang trái là to ra: mép trái lùi lại, mép phải đứng yên
        const dx = startX - ev.clientX;
        const w = Math.min(Math.max(origin.w + dx, MIN_W), MAX_W);
        setBox(clampBox({ ...origin, w, x: origin.x + (origin.w - w) }));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setBox((b) => {
          if (b) localStorage.setItem(BOX_KEY, JSON.stringify(b));
          return b;
        });
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [box]
  );

  const seek = useCallback((t: number) => apiRef.current?.seek(t), []);

  const value = useMemo<Ctx>(
    () => ({ current, mode, play, setMode, close, registerSlot, seek }),
    [current, mode, play, setMode, close, registerSlot, seek]
  );

  return (
    <PlayerCtx.Provider value={value}>
      {children}

      {host &&
        current &&
        createPortal(
          <div className="relative">
            {mode === 'mini' && (
              <MiniBar
                title={current.title}
                channel={current.channelName}
                onDragStart={startDrag}
                onExpand={expand}
                onClose={close}
              />
            )}

            <Player
              key={current.videoId}
              src={`/api/manifest/${current.videoId}`}
              videoId={current.videoId}
              poster={current.poster}
              captions={current.captions ?? []}
              theater={mode === 'full' && theater}
              onToggleTheater={() => mode === 'full' && setTheater((t) => !t)}
              related={current.related}
              onPickVideo={(next) => router.push(`/watch?v=${next}`)}
              compact={mode === 'mini'}
              onMinimize={() => setMode('mini')}
              registerApi={(api) => {
                apiRef.current = api;
              }}
            />

            {mode === 'mini' && (
              <>
                {/*
                  Nút nổi ngay trên khung hình. Thanh tiêu đề có thể bị đẩy ra ngoài
                  màn hình khi cửa sổ nằm sát mép, nên luôn cần một lối đóng nữa.
                */}
                <div className="absolute right-2 top-14 flex gap-1">
                  <button
                    onClick={expand}
                    title="Mở lại toàn màn hình"
                    aria-label="Mở lại toàn màn hình"
                    className="grid h-7 w-7 place-items-center rounded-full bg-black/70 hover:bg-black/90"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                      <path d="M4 4h7v2H6v5H4V4zm16 0v7h-2V6h-5V4h7zM4 20v-7h2v5h5v2H4zm16 0h-7v-2h5v-5h2v7z" />
                    </svg>
                  </button>

                  <button
                    onClick={close}
                    title="Đóng (Esc)"
                    aria-label="Đóng"
                    className="grid h-7 w-7 place-items-center rounded-full bg-black/70 hover:bg-yt-red"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* tay nắm ở góc trái dưới để đổi cỡ */}
                <div
                  onPointerDown={startResize}
                  title="Kéo để đổi kích thước"
                  className="absolute bottom-0 left-0 h-5 w-5 cursor-nesw-resize"
                >
                  <svg viewBox="0 0 20 20" className="h-full w-full text-white/40" fill="currentColor" aria-hidden>
                    <path d="M2 18v-6h1.5v4.5H8V18H2z" />
                  </svg>
                </div>
              </>
            )}
          </div>,
          host
        )}
    </PlayerCtx.Provider>
  );
}

/** Thanh tiêu đề của cửa sổ nhỏ: kéo để di chuyển, bấm để về trang xem */
function MiniBar({
  title,
  channel,
  onDragStart,
  onExpand,
  onClose,
}: {
  title: string;
  channel: string;
  onDragStart: (e: React.PointerEvent) => void;
  onExpand: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onPointerDown={onDragStart}
      className="flex cursor-grab items-center gap-2 bg-yt-elev px-3 py-2 active:cursor-grabbing"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-yt-sub" fill="currentColor" aria-hidden>
        <path d="M9 4h2v2H9V4zm4 0h2v2h-2V4zM9 9h2v2H9V9zm4 0h2v2h-2V9zm-4 5h2v2H9v-2zm4 0h2v2h-2v-2zm-4 5h2v2H9v-2zm4 0h2v2h-2v-2z" />
      </svg>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{title}</p>
        <p className="truncate text-[11px] text-yt-sub">{channel}</p>
      </div>

      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onExpand}
        title="Mở lại toàn màn hình"
        aria-label="Mở lại toàn màn hình"
        className="rounded-full p-1.5 hover:bg-yt-hover"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path d="M4 4h7v2H6v5H4V4zm16 0v7h-2V6h-5V4h7zM4 20v-7h2v5h5v2H4zm16 0h-7v-2h5v-5h2v7z" />
        </svg>
      </button>

      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
        title="Đóng"
        aria-label="Đóng"
        className="rounded-full p-1.5 hover:bg-yt-hover"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Chỗ đặt trình phát trên trang xem.
 *
 * Bình thường là khung rỗng đúng tỉ lệ để trình phát chuyển vào. Khi người dùng
 * đang xem ở cửa sổ nhỏ thì hiện lời nhắc kèm nút đưa về lại.
 */
export function PlayerSlot({ className = '' }: { className?: string }) {
  const { registerSlot, mode, setMode } = usePlayer();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerSlot(ref.current);
    return () => registerSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={ref} className={`w-full ${className}`} />

      {mode === 'mini' && (
        <div className="grid aspect-video w-full place-items-center rounded-xl bg-yt-elev text-center">
          <div>
            <p className="text-sm text-yt-sub">Đang phát ở cửa sổ nhỏ</p>
            <button
              onClick={() => setMode('full')}
              className="mt-3 rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-[#3f3f3f]"
            >
              Đưa về đây
            </button>
          </div>
        </div>
      )}
    </>
  );
}
