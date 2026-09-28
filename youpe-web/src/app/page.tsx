'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import VideoCard, { CardSkeleton } from '@/components/VideoCard';
import Chips from '@/components/Chips';
import { TOPICS, topicByKey } from '@/lib/topics';
import { getSubs } from '@/lib/subs';
import * as store from '@/lib/storage';
import { getPrefs } from '@/lib/prefs';
import type { VideoItem } from '@/lib/types';

/** Cứ bấy nhiêu video YouTube thì chen một phim Bilibili */
const BILI_EVERY = 4;

/**
 * Xen phim Bilibili vào giữa danh sách YouTube, đều đặn chứ không dồn một cục —
 * dồn cục thì hoặc cả hàng đầu toàn Bilibili, hoặc phải cuộn rất sâu mới thấy.
 */
function interleave(yt: VideoItem[], bili: VideoItem[]): VideoItem[] {
  if (!bili.length) return yt;
  const out: VideoItem[] = [];
  let b = 0;
  yt.forEach((v, i) => {
    out.push(v);
    if ((i + 1) % BILI_EVERY === 0 && b < bili.length) out.push(bili[b++]);
  });
  // YouTube ít quá thì phần Bilibili còn lại nối vào cuối
  return b < bili.length ? [...out, ...bili.slice(b)] : out;
}

/** Hỏi một trang phim Bilibili; hỏng thì coi như không có, trang chủ vẫn chạy */
async function biliPage(page: number): Promise<VideoItem[]> {
  try {
    const r = await fetch(`/api/bili/home?page=${page}`);
    const j = await r.json();
    return j.items ?? [];
  } catch {
    return [];
  }
}

const CHIPS = TOPICS.map((t) => ({ key: t.key, label: t.label }));

export default function HomePage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') ?? 'home';
  const topic = topicByKey(tab);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [err, setErr] = useState('');
  /** Trang chủ được trộn từ đâu — hiện thành một dòng nhỏ cho biết vì sao thấy mấy video này */
  const [mix, setMix] = useState<{ source: string; count: number }[]>([]);
  /*
    Nút "Thử lại" trước đây gọi router.refresh(). Trang này nạp dữ liệu bằng
    useEffect ở phía client, mà refresh() chỉ làm mới phần server component —
    effect không chạy lại, nên bấm nút không có gì xảy ra. Tăng số đếm này
    mới thực sự gọi lại API.
  */
  const [retry, setRetry] = useState(0);

  const sentinel = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  /** Trang Bilibili kế tiếp cần hỏi; 0 = không trộn / nguồn đã hết */
  const biliNext = useRef(0);
  /** Số lần nạp thêm liên tiếp không ra video mới nào */
  const emptyRounds = useRef(0);

  /* ---------- nạp lần đầu ---------- */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    setVideos([]);
    setMix([]);
    setCanLoadMore(false);
    seen.current = new Set();
    emptyRounds.current = 0;
    // chỉ tab "Tất cả" mới trộn Bilibili; tab chủ đề là muốn đúng chủ đề đó
    const mixBili = tab === 'home' && getPrefs().mixBilibili;
    biliNext.current = mixBili ? 1 : 0;
    window.scrollTo({ top: 0 });

    /*
      Tab "Trang chủ" đi đường riêng: gửi kèm kênh đăng ký và lịch sử xem để server
      trộn thành feed theo sở thích. Mấy tab chủ đề khác thì vẫn là feed chung —
      vào tab "Âm nhạc" là muốn xem nhạc, không phải xem thứ mình hay xem.

      Hai tín hiệu này nằm ở localStorage nên phải gửi lên; server không tự biết.
    */
    const load = async () => {
      try {
        if (tab !== 'home') {
          const r = await fetch(`/api/feed?tab=${tab}`);
          return { j: await r.json(), personal: false };
        }

        const history = store.getList('history');
        const r = await fetch('/api/home', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelIds: getSubs().map((c) => c.id),
            seedTitles: history.slice(0, 25).map((v) => v.title),
            watchedIds: history.slice(0, 150).map((v) => v.id),
          }),
        });
        return { j: await r.json(), personal: true };
      } catch (e) {
        return { j: { error: String(e), videos: [] }, personal: false };
      }
    };

    Promise.all([load(), mixBili ? biliPage(1) : Promise.resolve([] as VideoItem[])])
      .then(([{ j, personal }, bili]) => {
        if (!alive) return;
        biliNext.current = mixBili && bili.length ? 2 : 0;
        const list: VideoItem[] = interleave(j.videos ?? [], bili);
        list.forEach((v) => seen.current.add(v.id));
        setVideos(list);
        setMix([
          ...(j.mix ?? []),
          ...(bili.length ? [{ source: 'bilibili', count: bili.length }] : []),
        ]);
        /*
          Trang chủ cá nhân hoá vẫn cuộn thêm được: phần "thêm" lấy từ feed chung
          qua `/api/feed`. Nội dung theo sở thích thì hữu hạn — hết video mới của
          các kênh mình theo là hết — nên phía dưới chuyển sang khám phá là hợp lý.
        */
        setCanLoadMore(personal ? list.length > 0 : !!j.canLoadMore && list.length > 0);
        if (j.error) setErr(j.error);
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [tab, retry]);

  /* ---------- nạp thêm ---------- */
  const loadMore = useCallback(async () => {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    try {
      const biliPg = biliNext.current;
      const [j, bili] = await Promise.all([
        fetch(`/api/feed?tab=${tab}&more=1`).then((r) => r.json()),
        biliPg ? biliPage(biliPg) : Promise.resolve([] as VideoItem[]),
      ]);

      const freshYt: VideoItem[] = (j.videos ?? []).filter((v: VideoItem) => !seen.current.has(v.id));
      const freshBili = bili.filter((v) => !seen.current.has(v.id));
      biliNext.current = biliPg && freshBili.length ? biliPg + 1 : 0;

      const fresh = interleave(freshYt, freshBili);
      fresh.forEach((v) => seen.current.add(v.id));
      if (fresh.length) setVideos((prev) => [...prev, ...fresh]);

      /*
        Chỉ dừng khi server nói hết thật, hoặc hai lượt liền không ra gì mới.
        Trước đây một lượt toàn video trùng (chuyện thường ở lượt đầu, vì feed
        chung hay lặp lại mấy video vừa có ở phần cá nhân hoá) là dừng luôn.
      */
      emptyRounds.current = fresh.length ? 0 : emptyRounds.current + 1;
      const serverDone = j.done === true || j.canLoadMore === false;
      if ((serverDone && !biliNext.current) || emptyRounds.current >= 2) setCanLoadMore(false);
    } catch {
      setCanLoadMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [tab, loadingMore, canLoadMore]);

  // tự nạp khi cuộn gần tới cuối
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canLoadMore) return;

    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(),
      { rootMargin: '600px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, loadMore]);

  return (
    <div className="px-4 pb-16 sm:px-6">
      <Chips
        items={CHIPS}
        active={tab}
        onPick={(key) => router.push(key === 'home' ? '/' : `/?tab=${key}`)}
      />

      {tab !== 'home' && (
        <h1 className="mb-4 mt-1 text-xl font-bold">{topic.label}</h1>
      )}

      {tab === 'home' && mix.length > 0 && (
        <p className="mb-4 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-yt-sub">
          <span>Trộn từ</span>
          {mix.map((m) => (
            <span key={m.source} className="rounded-full bg-yt-chip px-2.5 py-1">
              {m.source} <span className="text-yt-text">{m.count}</span>
            </span>
          ))}
        </p>
      )}

      {/*
        Điều kiện cũ là `err && ...`, nghĩa là API trả 200 kèm mảng rỗng mà không
        báo lỗi thì trang chủ **không vẽ gì cả** — người dùng nhìn thấy một màn hình
        đen tuyền, không biết là đang tải, hỏng, hay hết nội dung. Rỗng thì luôn
        phải nói một câu.
      */}
      {!loading && !videos.length && (
        <div className="grid place-items-center py-20 text-center">
          <svg viewBox="0 0 24 24" className="mb-3 h-12 w-12 text-yt-sub" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z" />
          </svg>
          <p className="text-base">
            {err ? 'Không tải được nội dung' : 'Chưa có video nào để hiện'}
          </p>
          <p className="mt-1 max-w-lg text-sm text-yt-sub">
            {err ||
              'YouTube không trả về video nào cho feed này. Thử lại, hoặc mở /api/debug/<videoId> để xem tầng nào đang hỏng.'}
          </p>
          <button
            onClick={() => setRetry((n) => n + 1)}
            className="mt-4 rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-yt-chip2"
          >
            Thử lại
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
        {loading
          ? Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} />)
          : videos.map((v, i) => <VideoCard key={v.id} v={v} index={i} />)}

        {loadingMore &&
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={`more-${i}`} />)}
      </div>

      <div ref={sentinel} className="h-4" />

      {!loading && !canLoadMore && videos.length > 0 && (
        <p className="py-10 text-center text-sm text-yt-sub">Hết rồi</p>
      )}
    </div>
  );
}
