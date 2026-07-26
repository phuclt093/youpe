'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Vạch tiến trình mảnh ở đỉnh trang khi chuyển route.
 * Next.js không cho biết lúc nào điều hướng xong, nên cách làm là: bắt mọi cú nhấn
 * vào thẻ <a> nội bộ để bật vạch, rồi tắt khi pathname/query thật sự đổi.
 */
export default function TopProgress() {
  const path = usePathname();
  const params = useSearchParams();
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setWidth(100);
    setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 220);
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;

      const a = (e.target as HTMLElement)?.closest?.('a');
      if (!a) return;

      const href = a.getAttribute('href');
      if (!href || !href.startsWith('/') || a.target === '_blank') return;
      if (href === path + (params.toString() ? `?${params}` : '')) return;

      setActive(true);
      setWidth(8);
      if (timer.current) clearInterval(timer.current);
      // tiến dần nhưng không bao giờ tới 100 — chỉ khi điều hướng xong mới đầy
      timer.current = setInterval(() => setWidth((w) => (w < 88 ? w + (90 - w) * 0.12 : w)), 120);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [path, params]);

  // route đã đổi -> đóng vạch
  useEffect(() => {
    if (active) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, params.toString()]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  if (!active) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[200] h-0.5 bg-transparent">
      <div
        className="h-full bg-yt-red transition-[width] duration-200 ease-out"
        style={{ width: `${width}%`, boxShadow: '0 0 8px rgba(255,0,51,.7)' }}
      />
    </div>
  );
}
