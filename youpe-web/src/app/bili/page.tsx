'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import VideoCard, { CardSkeleton } from '@/components/VideoCard';
import Chips from '@/components/Chips';
import * as store from '@/lib/storage';
import { getPins, onPinsChange, pinToItem } from '@/lib/biliPins';
import type { VideoItem } from '@/lib/types';

type Status = {
  ytdlp: boolean;
  cookieSource: 'browser' | 'file' | '';
  browser: string | null;
  fileExists: boolean | null;
  dedicated: boolean;
};

/**
 * Chip thể loại. Bilibili.tv không có API danh mục công khai nên mỗi chip là một
 * từ khoá tìm kiếm — đổi, thêm, bớt ở đây là xong.
 */
const CATS: { key: string; label: string; q: string }[] = [
  { key: 'home', label: 'Đề xuất', q: '' },
  { key: 'pinned', label: 'Đã ghim', q: '' },
  { key: 'anime', label: 'Anime', q: 'anime' },
  { key: 'donghua', label: 'Hoạt hình Trung Quốc', q: 'hoạt hình trung quốc' },
  { key: 'tutien', label: 'Tu tiên', q: 'tu tiên' },
  { key: 'isekai', label: 'Chuyển sinh', q: 'chuyển sinh' },
  { key: 'cdrama', label: 'Phim Trung Quốc', q: 'phim trung quốc' },
  { key: 'action', label: 'Hành động', q: 'hành động' },
  { key: 'romance', label: 'Tình cảm', q: 'tình cảm' },
  { key: 'comedy', label: 'Hài hước', q: 'hài hước' },
  { key: 'history', label: 'Đã xem', q: '' },
];

/**
 * Tab Bilibili — bố cục giống trang chủ: chip thể loại, lưới trải rộng, cuộn tới
 * đâu tải thêm tới đó.
 *
 * Bilibili không có "Đăng nhập bằng Bilibili" cho ứng dụng ngoài, nên app **không**
 * hỏi mật khẩu. Bạn đăng nhập bilibili.tv trong trình duyệt, app mượn lại cookie
 * sẵn có — phần hướng dẫn nằm sau nút tình trạng ở góc phải.
 */
export default function BiliPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = sp.get('q') ?? '';
  const cat = sp.get('cat') ?? (q ? '' : 'home');

  const [items, setItems] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(true);
  // đến từ nút "Xem cách đăng nhập Bilibili" trên trang xem thì mở sẵn hướng dẫn
  const [showSetup, setShowSetup] = useState(sp.get('setup') === '1');

  /* ---------- phim đã ghim ---------- */
  const [pins, setPins] = useState<VideoItem[]>([]);
  useEffect(() => {
    const read = () => setPins(getPins().map(pinToItem));
    read();
    return onPinsChange(read);
  }, []);

  /* ---------- tình trạng tài khoản ---------- */
  const check = useCallback(() => {
    setChecking(true);
    fetch('/api/bili/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setChecking(false));
  }, []);
  useEffect(check, [check]);

  /* ---------- nguồn dữ liệu của chip / từ khoá đang chọn ---------- */
  const activeCat = CATS.find((c) => c.key === cat);
  const query = q || activeCat?.q || '';
  const isHistory = cat === 'history' && !q;
  const isPinned = cat === 'pinned' && !q;
  /** Hai chip này đọc từ máy, không gọi mạng và không phân trang */
  const isLocal = isHistory || isPinned;

  const urlFor = useCallback(
    (p: number) =>
      query
        ? `/api/bili/search?q=${encodeURIComponent(query)}&page=${p}`
        : `/api/bili/home?page=${p}`,
    [query]
  );

  useEffect(() => {
    let alive = true;
    setItems([]);
    setPage(1);
    setDone(false);
    setFailed(false);

    if (isLocal) {
      setItems(
        isHistory
          ? store.getList('history').filter((v) => v.id.startsWith('bili_'))
          : getPins().map(pinToItem)
      );
      setDone(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(urlFor(1))
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const list: VideoItem[] = j.items ?? [];
        setItems(list);
        setFailed(!list.length);
        if (!list.length) setDone(true);
      })
      .catch(() => alive && (setFailed(true), setDone(true)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [urlFor, isHistory, isPinned, isLocal]);

  // đang ở chip "Đã ghim" mà bỏ ghim một phim thì lưới cập nhật ngay
  useEffect(() => {
    if (isPinned) setItems(pins);
  }, [isPinned, pins]);

  /* ---------- cuộn tới cuối thì tải trang kế ---------- */
  const loadMore = useCallback(() => {
    if (loading || loadingMore || done || isLocal) return;
    const next = page + 1;
    setLoadingMore(true);
    fetch(urlFor(next))
      .then((r) => r.json())
      .then((j) => {
        const fresh: VideoItem[] = j.items ?? [];
        let added = 0;
        setItems((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          const add = fresh.filter((v) => !seen.has(v.id));
          added = add.length;
          return [...prev, ...add];
        });
        setPage(next);
        // trang mới toàn trùng lặp nghĩa là nguồn đã hết, dừng hỏi tiếp
        setTimeout(() => added === 0 && setDone(true), 0);
      })
      .catch(() => setDone(true))
      .finally(() => setLoadingMore(false));
  }, [loading, loadingMore, done, isLocal, page, urlFor]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && loadMore(), {
      rootMargin: '600px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  /* ---------- điều hướng ---------- */
  const pickCat = (key: string) =>
    router.push(key === 'home' ? pathname : `${pathname}?cat=${key}`);

  const signedIn = !!status?.cookieSource;

  return (
    <div className="px-4 pb-16 sm:px-6">
      {/*
        Không còn ô tìm kiếm riêng: khung tìm kiếm ở đầu trang tự chuyển sang tìm
        trên Bilibili khi đang ở tab này. Nút tình trạng tài khoản dời xuống cuối
        hàng chip cho gọn.
      */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Chips items={CATS} active={q ? '' : cat} onPick={pickCat} />
        </div>
        <button
          onClick={() => setShowSetup((v) => !v)}
          className="mb-3 flex shrink-0 items-center gap-2 rounded-full bg-yt-chip px-3 py-1.5 text-xs font-medium hover:bg-yt-chip2"
        >
          <span className={`h-2 w-2 rounded-full ${!checking && signedIn ? 'bg-emerald-500' : 'bg-yt-sub'}`} />
          {checking ? 'Đang kiểm tra…' : signedIn ? 'Đã có tài khoản' : 'Chưa đăng nhập'}
        </button>
      </div>

      {showSetup && <Setup status={status} checking={checking} onCheck={check} />}

      {/* ---- phim đã ghim: một hàng ngang ở đầu trang Đề xuất ---- */}
      {cat === 'home' && !q && pins.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-medium">Phim đã ghim</h2>
            {pins.length > 4 && (
              <button onClick={() => pickCat('pinned')} className="text-xs font-medium text-yt-blue hover:underline">
                Xem tất cả ({pins.length})
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
            {pins.slice(0, 4).map((v, i) => (
              <VideoCard key={v.id} v={v} index={i} />
            ))}
          </div>
          <h2 className="mb-3 mt-8 text-base font-medium">Đề xuất trên Bilibili</h2>
        </section>
      )}

      {q && <h1 className="mb-4 mt-1 text-xl font-bold">Kết quả cho “{q}”</h1>}

      {/* ---- lưới — cùng số cột với trang chủ ---- */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
        {loading
          ? Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} />)
          : items.map((v, i) => <VideoCard key={v.id} v={v} index={i} />)}
        {loadingMore && Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={`m${i}`} />)}
      </div>

      <div ref={sentinel} className="h-4" />

      {!loading && isHistory && !items.length && (
        <p className="py-10 text-center text-sm text-yt-sub">Bạn chưa xem gì trên Bilibili.</p>
      )}

      {!loading && isPinned && !items.length && (
        <p className="py-10 text-center text-sm text-yt-sub">
          Chưa ghim phim nào. Rê chuột lên một phim rồi bấm biểu tượng ghim ở góc ảnh, hoặc bấm
          Ghim phim khi đang xem.
        </p>
      )}

      {!loading && failed && !isLocal && (
        <div className="mx-auto mt-6 max-w-xl rounded-xl bg-yt-elev p-4 text-sm text-yt-sub">
          <p>
            {query
              ? 'Không tìm được gì — hoặc bilibili.tv vừa đổi cách trả kết quả tìm kiếm.'
              : 'Chưa lấy được trang chủ của bilibili.tv.'}{' '}
            Dán link vào ô tìm kiếm vẫn xem được.
          </p>
          <p className="mt-2 text-xs">
            Nếu lỗi kéo dài, mở{' '}
            <a
              href={`/api/bili/debug${query ? `?q=${encodeURIComponent(query)}` : ''}`}
              target="_blank"
              className="text-yt-blue hover:underline"
            >
              trang gỡ lỗi
            </a>{' '}
            để xem bilibili.tv đang trả về gì.
          </p>
        </div>
      )}

      {!loading && done && !failed && items.length > 0 && !isLocal && (
        <p className="py-10 text-center text-sm text-yt-sub">Hết rồi</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Setup({
  status,
  checking,
  onCheck,
}: {
  status: Status | null;
  checking: boolean;
  onCheck: () => void;
}) {
  const signedIn = !!status?.cookieSource;

  return (
    <div className="anim-fade-in mt-3 max-w-3xl rounded-xl bg-yt-elev p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {checking ? 'Đang kiểm tra…' : signedIn ? 'Đã có cookie Bilibili' : 'Chưa cấu hình tài khoản Bilibili'}
          </p>
          {!checking && status && (
            <p className="mt-1 text-xs text-yt-sub">
              {status.cookieSource === 'browser' &&
                `Đọc cookie từ trình duyệt ${status.browser}${status.dedicated ? '' : ' (dùng chung cấu hình với YouTube)'}.`}
              {status.cookieSource === 'file' &&
                (status.fileExists
                  ? 'Dùng file cookies.txt đã cấu hình.'
                  : 'Đã cấu hình file cookies.txt nhưng không tìm thấy file — kiểm tra lại đường dẫn.')}
              {!status.cookieSource && 'Nội dung công khai vẫn xem được. Chỉ cần cookie khi video đòi đăng nhập.'}
            </p>
          )}
          {!checking && status && !status.ytdlp && (
            <p className="mt-1 text-xs text-yt-red">
              Không tìm thấy yt-dlp — chạy `npm run setup:ytdlp` trong thư mục youpe-web.
            </p>
          )}
        </div>
        <button
          onClick={onCheck}
          className="shrink-0 rounded-full bg-yt-chip px-3 py-1.5 text-xs font-medium hover:bg-yt-chip2"
        >
          Kiểm tra lại
        </button>
      </div>

      {!checking && !signedIn && (
        <ol className="mt-4 space-y-2 border-t border-yt-border pt-4 text-xs leading-5 text-yt-sub">
          <li>
            <span className="font-medium text-yt-text">1.</span> Đăng nhập bilibili.tv bằng trình
            duyệt của bạn. youpe không hỏi mật khẩu Bilibili — Bilibili không có cơ chế đăng nhập
            cho ứng dụng ngoài, nên app chỉ mượn lại cookie sẵn có trong trình duyệt.
          </li>
          <li>
            <span className="font-medium text-yt-text">2.</span> Trong file{' '}
            <code className="rounded bg-yt-chip px-1">.env.local</code> của youpe-web, thêm{' '}
            <code className="rounded bg-yt-chip px-1">BILI_COOKIES_FROM_BROWSER=chrome</code> (hoặc
            firefox, edge, brave…).
          </li>
          <li>
            <span className="font-medium text-yt-text">3.</span> Đóng hẳn trình duyệt đó — đang mở
            thì file cookie bị khoá.
          </li>
          <li>
            <span className="font-medium text-yt-text">4.</span> Khởi động lại youpe rồi bấm Kiểm
            tra lại.
          </li>
        </ol>
      )}

      <p className="mt-4 border-t border-yt-border pt-3 text-xs text-yt-sub">
        Đăng nhập không mở được phim trả phí mà tài khoản bạn chưa mua, cũng không bỏ qua giới
        hạn theo vùng.
      </p>
    </div>
  );
}
