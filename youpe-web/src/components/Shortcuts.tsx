'use client';

import { useEffect, useState } from 'react';
import { CloseIcon } from './Icons';

const ROWS: [string, string][] = [
  ['/', 'Vào ô tìm kiếm'],
  ['?', 'Mở bảng này'],
  ['Space / K', 'Phát hoặc dừng'],
  ['J / L', 'Tua lùi hoặc tới 10 giây'],
  ['← / →', 'Tua 5 giây'],
  ['M', 'Tắt hoặc bật tiếng'],
  ['F', 'Toàn màn hình'],
  ['T', 'Chế độ rạp hát'],
  ['C', 'Bật hoặc tắt phụ đề'],
  ['Esc', 'Đóng bảng này'],
];

/** Bảng phím tắt, mở bằng dấu ? — giống thói quen của YouTube */
export default function Shortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable)
        return;

      if (e.key === '?') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!open) return null;

  return (
    <div
      className="anim-fade-in fixed inset-0 z-[150] grid place-items-center bg-black/70 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-pop w-full max-w-md rounded-2xl bg-yt-elev p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Phím tắt</h2>
          <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-yt-hover">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-1">
          {ROWS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-yt-sub">{v}</span>
              <kbd className="rounded bg-yt-chip px-2 py-1 font-mono text-xs">{k}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
