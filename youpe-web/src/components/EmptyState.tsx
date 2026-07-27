'use client';

import Link from 'next/link';

/**
 * Trạng thái rỗng dùng chung.
 * Trước đây mỗi trang tự viết một kiểu, chỗ chỉ một dòng chữ xám, chỗ có nút, chỗ không.
 */
export default function EmptyState({
  icon,
  title,
  hint,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="grid place-items-center px-4 py-20 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-yt-elev text-yt-sub">
          {icon ?? (
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
              <path d="M10 16.5l6-4.5-6-4.5v9zM12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z" />
            </svg>
          )}
        </div>

        <p className="text-lg font-medium">{title}</p>
        {hint && <p className="mt-2 text-sm leading-6 text-yt-sub">{hint}</p>}

        {actionLabel && actionHref && (
          <Link
            href={actionHref}
            className="mt-5 inline-block rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-[#3f3f3f]"
          >
            {actionLabel}
          </Link>
        )}

        {actionLabel && onAction && !actionHref && (
          <button
            onClick={onAction}
            className="mt-5 rounded-full bg-yt-text px-4 py-2 text-sm font-medium text-yt-bg hover:bg-white/90"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
