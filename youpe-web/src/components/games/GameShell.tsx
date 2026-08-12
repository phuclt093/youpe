'use client';

import Link from 'next/link';
import { BackIcon } from '../Icons';
import type { Level } from '@/lib/games';

/**
 * Khung chung của một màn chơi: tiêu đề, cách điều khiển, điểm, nút chơi lại.
 *
 * Bốn game khác nhau hoàn toàn về luật nhưng giống hệt nhau ở phần vỏ. Gom vào
 * đây để mỗi game chỉ còn lo đúng phần chơi của nó.
 */
export default function GameShell({
  name,
  how,
  stats,
  onRestart,
  levels,
  level,
  onLevel,
  children,
  footer,
}: {
  name: string;
  how: string;
  /** Các cặp nhãn–giá trị hiện ở thanh trên, vd điểm và kỷ lục */
  stats: { label: string; value: string | number }[];
  onRestart: () => void;
  levels?: { id: Level; name: string }[];
  level?: Level;
  onLevel?: (l: Level) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/games"
          aria-label="Về danh sách trò chơi"
          className="rounded-full p-2 text-yt-sub hover:bg-yt-hover hover:text-yt-text"
        >
          <BackIcon className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{name}</h1>
          <p className="text-xs text-yt-sub">{how}</p>
        </div>
      </div>

      {levels && level && onLevel && (
        <div className="mb-4 flex flex-wrap gap-2">
          {levels.map((l) => (
            <button
              key={l.id}
              onClick={() => onLevel(l.id)}
              aria-pressed={l.id === level}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                l.id === level
                  ? 'chip-active bg-yt-text font-medium text-yt-bg'
                  : 'bg-yt-chip text-yt-text hover:bg-yt-chip2'
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-yt-elev px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-yt-sub">{s.label}</p>
            <p className="text-lg font-medium tabular-nums">{s.value}</p>
          </div>
        ))}

        <button
          onClick={onRestart}
          className="ml-auto rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-yt-chip2"
        >
          Chơi lại
        </button>
      </div>

      {children}

      {footer && <div className="mt-4 text-sm text-yt-sub">{footer}</div>}
    </div>
  );
}

/**
 * Bảng thông báo phủ lên bàn chơi khi thắng hoặc thua.
 *
 * Đặt tuyệt đối bên trong bàn chơi chứ không phải giữa màn hình: người chơi vẫn
 * thấy được thế cờ cuối cùng phía sau, và không phải rời mắt đi đâu.
 */
export function GameOver({
  title,
  hint,
  onRestart,
}: {
  title: string;
  hint?: string;
  onRestart: () => void;
}) {
  return (
    <div className="anim-fade-in absolute inset-0 z-10 grid place-items-center rounded-xl bg-yt-bg/85 p-4 text-center">
      <div>
        <p className="text-xl font-bold">{title}</p>
        {hint && <p className="mt-1 text-sm text-yt-sub">{hint}</p>}
        <button
          onClick={onRestart}
          className="mt-4 rounded-full bg-yt-text px-5 py-2 text-sm font-medium text-yt-bg hover:bg-yt-text/90"
        >
          Chơi lại
        </button>
      </div>
    </div>
  );
}
