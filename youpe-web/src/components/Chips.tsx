'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hàng chip cuộn ngang. Mũi tên chỉ hiện khi còn nội dung ở phía đó,
 * kèm lớp mờ ở mép để người dùng biết là cuộn được.
 */
export default function Chips({
  items,
  active,
  onPick,
}: {
  items: { key: string; label: string }[];
  active: string;
  onPick: (key: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el) return;

    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [measure, items.length]);

  // chip đang chọn tự cuộn vào tầm nhìn
  useEffect(() => {
    railRef.current
      ?.querySelector<HTMLElement>(`[data-chip="${active}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [active]);

  const nudge = (dir: -1 | 1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div className="sticky top-14 z-20 -mx-4 bg-yt-bg px-4 py-3 sm:-mx-6 sm:px-6">
      <div className="relative">
        {canLeft && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-yt-bg to-transparent" />
            <button
              onClick={() => nudge(-1)}
              aria-label="Cuộn sang trái"
              className="absolute left-0 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-yt-elev shadow-lg hover:bg-yt-hover"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M15.4 7.4L14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" />
              </svg>
            </button>
          </>
        )}

        <div ref={railRef} className="no-scrollbar flex gap-3 overflow-x-auto scroll-smooth">
          {items.map((c) => (
            <button
              key={c.key}
              data-chip={c.key}
              onClick={() => onPick(c.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                active === c.key
                  ? 'bg-yt-text text-yt-bg'
                  : 'bg-yt-chip text-yt-text hover:bg-[#3f3f3f]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {canRight && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-yt-bg to-transparent" />
            <button
              onClick={() => nudge(1)}
              aria-label="Cuộn sang phải"
              className="absolute right-0 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-yt-elev shadow-lg hover:bg-yt-hover"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M8.6 7.4L10 6l6 6-6 6-1.4-1.4 4.6-4.6z" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
