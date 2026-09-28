'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { VideoItem } from '@/lib/types';
import { formatDuration, viPublished } from '@/lib/format';
import { VerifiedIcon } from './Icons';
import {
  cancelPrefetch, getPrefetchState, onPrefetchChange, prefetchNow,
  prefetchOnHover, type PrefetchState,
} from '@/lib/prefetch';
import { onProgressChange, progressRatio } from '@/lib/progress';
import {
  claimPreview, getPreviewUrl, isPreviewActive, previewEnabled, releasePreview,
} from '@/lib/preview';

export function Thumb({ v, hovered = false }: { v: VideoItem; hovered?: boolean }) {
  const [ratio, setRatio] = useState(0);
  const [warm, setWarm] = useState<PrefetchState>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewOn, setPreviewOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setWarm(getPrefetchState(v.id));
    return onPrefetchChange((id, st) => {
      if (id === v.id) setWarm(st);
    });
  }, [v.id]);

  // đọc sau khi dựng xong để tránh lệch giữa server và trình duyệt
  useEffect(() => {
    const read = () => setRatio(progressRatio(v.id));
    read();
    return onProgressChange(read);
  }, [v.id]);

  /**
   * Xem trước: rê chuột giữ đủ lâu mới lấy luồng và phát.
   * Chờ 700ms để lướt qua nhiều card không kích hoạt hàng loạt.
   *
   * Chỉ xem trước khi luồng **đã nằm sẵn trong cache của server**. Chưa có thì việc
   * lấy luồng phải chờ yt-dlp chạy, mất vài giây — không nên tốn một lượt trích xuất
   * chỉ vì con trỏ lướt ngang qua. Trạng thái nạp trước cho biết chính xác điều đó.
   *
   * `warm` nằm trong danh sách phụ thuộc là điểm mấu chốt: trước đây hết 700ms mà
   * luồng chưa sẵn sàng thì hàm này bỏ cuộc luôn và không bao giờ thử lại, nên lần rê
   * chuột đầu tiên gần như chẳng khi nào ra được đoạn xem trước — phải rê ra rồi rê
   * vào lần nữa. Giờ nạp trước xong là hàm chạy lại và bắt đầu phát, miễn là con trỏ
   * vẫn còn nằm trên thẻ.
   */
  useEffect(() => {
    if (!hovered || v.isLive || !previewEnabled() || warm !== 'ready') {
      releasePreview(v.id);
      setPreviewOn(false);
      return;
    }

    let alive = true;
    const timer = setTimeout(async () => {
      claimPreview(v.id);
      const url = preview ?? (await getPreviewUrl(v.id));
      // rê sang card khác trong lúc chờ thì bỏ
      if (!alive || !isPreviewActive(v.id) || !url) return;

      setPreview(url);
      setPreviewOn(true);
    }, 700);

    return () => {
      alive = false;
      clearTimeout(timer);
      releasePreview(v.id);
      setPreviewOn(false);
    };
  }, [hovered, warm, v.id, v.isLive, preview]);

  // bắt đầu phát ngay khi thẻ video sẵn sàng
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !previewOn) return;
    /*
      Không đặt `currentTime = 0` ở đây. Thẻ vừa được dựng nên đã ở mốc 0 sẵn, mà
      gán lúc chưa có metadata thì trình duyệt xếp hàng một lượt tua — thêm một
      vòng gọi mạng nữa trước khi hình đầu tiên hiện ra.
    */
    el.play().catch(() => {});
  }, [previewOn]);

  return (
    <div className="card-thumb relative aspect-video w-full overflow-hidden rounded-2xl bg-yt-elev">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={v.thumbnail}
        alt=""
        loading="lazy"
        /*
          CDN ảnh của Bilibili từ chối khi thấy Referer là trang lạ (youpe) — ảnh vỡ,
          chỉ còn chữ alt. Không gửi Referer thì họ cho qua. YouTube không quan tâm
          chuyện này nên đặt chung cho mọi ảnh cũng không sao.
          Vẫn hỏng thì thử một lần nữa qua proxy của app.
        */
        referrerPolicy="no-referrer"
        onError={(e) => {
          const img = e.currentTarget;
          if (img.dataset.retried || !v.thumbnail || v.thumbnail.startsWith('/')) return;
          img.dataset.retried = '1';
          img.src = `/api/stream?u=${encodeURIComponent(v.thumbnail)}`;
        }}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          previewOn ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {/* Xem trước: không tiếng, độ phân giải thấp nhất cho nhẹ băng thông */}
      {/*
        Ba thuộc tính disable* dưới đây là bắt buộc, không phải cho gọn:
        Chromium tự gắn nút "cửa sổ nổi" lên mọi thẻ video đang phát, kể cả thẻ bé
        như xem trước. Chạm phải là đoạn xem trước bị bốc ra cửa sổ nổi của hệ điều hành.
      */}
      {previewOn && preview && (
        <video
          ref={videoRef}
          src={preview}
          muted
          playsInline
          loop
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noplaybackrate noremoteplayback"
          className="anim-fade-in pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      )}
      {v.isLive ? (
        <span className="badge-live absolute bottom-2 right-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium tracking-wide">
          TRỰC TIẾP
        </span>
      ) : (
        (v.durationText || v.durationSec) && (
          <span className="badge-time absolute bottom-2 right-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
            {v.durationText || formatDuration(v.durationSec)}
          </span>
        )
      )}

      {/*
        Chấm báo trạng thái nạp trước. Không có phản hồi nhìn thấy được thì
        không ai biết việc nạp trước có chạy hay không.
      */}
      {warm === 'loading' && (
        <span
          title="Đang chuẩn bị"
          className="absolute left-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-white/70"
        />
      )}
      {warm === 'ready' && (
        <span
          title="Đã sẵn sàng, bấm là phát ngay"
          className="anim-fade-in absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,.9)]"
        />
      )}

      {/* vạch đỏ báo đã xem tới đâu */}
      {ratio > 0.01 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <div className="grad-accent h-full" style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * Nhận diện nguồn ngay dưới tiêu đề, đúng chỗ YouTube đặt tên kênh.
 *
 * Phim Bilibili không có kênh nên dòng này bỏ trống, cả thẻ lệch hẳn so với các
 * thẻ YouTube xung quanh. Đặt "● Bilibili" vào đó vừa lấp chỗ trống vừa cho biết
 * nguồn — cùng kiểu chấm màu + tên với nút chuyển nguồn trên thanh tiêu đề.
 */
const isBili = (id: string) => id.startsWith('bili_');

function SourceLine({ v, small = false }: { v: VideoItem; small?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${small ? 'text-xs' : 'text-[13px]'}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
      <span className="shrink-0 font-medium text-yt-text/80">Bilibili</span>
      {v.author.name && (
        <>
          <span className="shrink-0">·</span>
          <span className="truncate">{v.author.name}</span>
        </>
      )}
    </span>
  );
}

/** Ô tròn thế chỗ ảnh kênh, để thẻ Bilibili thẳng hàng với thẻ YouTube */
function SourceAvatar() {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-400/15 text-sky-500">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M8.3 2.3 11 5h2l2.7-2.7 1.06 1.06L15.1 5H19a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.9L7.24 3.36 8.3 2.3zM5 6.5a.5.5 0 0 0-.5.5v11c0 .28.22.5.5.5h14a.5.5 0 0 0 .5-.5V7a.5.5 0 0 0-.5-.5H5zm2.5 2.75h1.5v2h-1.5v-2zm7.5 0h1.5v2H15v-2zm-5 4h4v1.5h-4v-1.5z" />
      </svg>
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

  /**
   * Vài card đầu được nạp trước ngầm, không chờ rê chuột.
   * Chờ rê chuột thì thường không kịp: trích xuất mất vài giây, mà người ta
   * rê rồi bấm trong chưa tới một giây.
   */
  /*
    Trước đây 4 thẻ đầu tự nạp trước ngay khi mở trang. Bỏ đi: mỗi lần nạp là một lần
    server chạy yt-dlp, bốn lần cùng lúc thì chúng tranh băng thông và CPU với chính
    video đang phát — đó là nguồn gốc của những cú giật vô cớ. Nạp trước giờ chỉ xảy
    ra khi người dùng thật sự tỏ ý muốn xem: rê chuột hoặc nhấn.
  */

  const [hovered, setHovered] = useState(false);

  // nạp trước luồng phát để lúc bấm vào thì server đã có sẵn
  const warm = {
    onMouseEnter: () => {
      setHovered(true);
      prefetchOnHover(v.id);
    },
    onMouseLeave: () => {
      setHovered(false);
      cancelPrefetch(v.id);
    },
    onMouseDown: () => prefetchNow(v.id),
    onTouchStart: () => prefetchNow(v.id),
  };
  if (compact) {
    return (
      <Link href={`/watch?v=${v.id}`} style={delay} {...warm} className="anim-fade-up group flex gap-2">
        <div className="w-[168px] shrink-0">
          <Thumb v={v} hovered={hovered} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="card-title line-clamp-2 text-sm font-medium leading-5">{v.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-yt-sub">
            {isBili(v.id) ? (
              <SourceLine v={v} small />
            ) : (
              <>
                <span className="truncate">{v.author.name}</span>
                {v.author.verified && <VerifiedIcon className="h-3 w-3 shrink-0 text-yt-sub" />}
              </>
            )}
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
      <Thumb v={v} hovered={hovered} />
      <div className="mt-3 flex gap-3">
        {isBili(v.id) && !v.author.avatar ? (
          <SourceAvatar />
        ) : v.author.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.author.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full" loading="lazy" referrerPolicy="no-referrer" />
        ) : v.author.name ? (
          <div className="h-9 w-9 shrink-0 rounded-full bg-yt-elev" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="card-title line-clamp-2 text-[15px] font-medium leading-[22px]">{v.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-[13px] text-yt-sub hover:text-yt-text">
            {isBili(v.id) ? (
              <SourceLine v={v} />
            ) : (
              <>
                <span className="truncate">{v.author.name}</span>
                {v.author.verified && <VerifiedIcon className="h-3.5 w-3.5 shrink-0" />}
              </>
            )}
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
