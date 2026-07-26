'use client';

import Link from 'next/link';
import type { VideoItem } from '@/lib/types';
import { formatDuration, viPublished } from '@/lib/format';
import { VerifiedIcon } from './Icons';
import { cancelPrefetch, prefetchNow, prefetchOnHover } from '@/lib/prefetch';

export function Thumb({ v }: { v: VideoItem }) {
  return (
    <div className="card-thumb relative aspect-video w-full overflow-hidden rounded-xl bg-yt-elev">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={v.thumbnail}
        alt={v.title}
        loading="lazy"
        className="h-full w-full object-cover"
      />
      {v.isLive ? (
        <span className="absolute bottom-1 right-1 rounded bg-yt-red px-1 py-0.5 text-[11px] font-medium">
          TRỰC TIẾP
        </span>
      ) : (
        (v.durationText || v.durationSec) && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[11px] font-medium">
            {v.durationText || formatDuration(v.durationSec)}
          </span>
        )
      )}
    </div>
  );
}

export default function VideoCard({
  v,
  compact = false,
  index = 0,
}: {
  v: VideoItem;
  compact?: boolean;
  index?: number;
}) {
  // xuất hiện so le nhau cho đỡ khô, nhưng chặn trần để card cuối không chờ lâu
  const delay = { animationDelay: `${Math.min(index, 11) * 35}ms` };

  // nạp trước luồng phát để lúc bấm vào thì server đã có sẵn
  const warm = {
    onMouseEnter: () => prefetchOnHover(v.id),
    onMouseLeave: () => cancelPrefetch(v.id),
    onMouseDown: () => prefetchNow(v.id),
    onTouchStart: () => prefetchNow(v.id),
  };
  if (compact) {
    return (
      <Link href={`/watch?v=${v.id}`} style={delay} {...warm} className="anim-fade-up group flex gap-2">
        <div className="w-[168px] shrink-0">
          <Thumb v={v} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="card-title line-clamp-2 text-sm font-medium leading-5">{v.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-yt-sub">
            <span className="truncate">{v.author.name}</span>
            {v.author.verified && <VerifiedIcon className="h-3 w-3 shrink-0 text-yt-sub" />}
          </p>
          <p className="text-xs text-yt-sub">
            {v.viewsText}
            {v.viewsText && v.publishedText ? ' · ' : ''}
            {viPublished(v.publishedText)}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/watch?v=${v.id}`} style={delay} {...warm} className="anim-fade-up group flex flex-col">
      <Thumb v={v} />
      <div className="mt-3 flex gap-3">
        {v.author.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.author.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full" loading="lazy" />
        ) : (
          <div className="h-9 w-9 shrink-0 rounded-full bg-yt-elev" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="card-title line-clamp-2 text-[15px] font-medium leading-[22px]">{v.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-[13px] text-yt-sub hover:text-yt-text">
            <span className="truncate">{v.author.name}</span>
            {v.author.verified && <VerifiedIcon className="h-3.5 w-3.5 shrink-0" />}
          </p>
          <p className="text-[13px] text-yt-sub">
            {v.viewsText}
            {v.viewsText && v.publishedText ? ' · ' : ''}
            {viPublished(v.publishedText)}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function CardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="skeleton aspect-video w-full rounded-xl" />
      <div className="mt-3 flex gap-3">
        <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-3/5 rounded" />
          <div className="skeleton h-3 w-2/5 rounded" />
        </div>
      </div>
    </div>
  );
}
