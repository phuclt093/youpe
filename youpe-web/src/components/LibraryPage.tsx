'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Thumb } from '@/components/VideoCard';
import { TrashIcon } from '@/components/Icons';
import EmptyState from '@/components/EmptyState';
import { timeAgoFromMs } from '@/lib/format';
import * as store from '@/lib/storage';
import { useAuth } from '@/components/AuthProvider';

export default function LibraryPage({
  storeKey, title, emptyText,
}: { storeKey: store.StoreKey; title: string; emptyText: string }) {
  const [items, setItems] = useState<store.StoredVideo[]>([]);
  const { user } = useAuth();

  const refresh = () => setItems(store.getList(storeKey));

  useEffect(() => {
    refresh();
    if (user) store.pullFromServer(storeKey).then(setItems);
    const h = () => refresh();
    window.addEventListener('youpe-store', h);
    return () => window.removeEventListener('youpe-store', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey, user]);

  return (
    <div className="mx-auto max-w-[1096px] px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{title}</h1>
        {items.length > 0 && (
          <button
            onClick={() => { store.clear(storeKey); refresh(); }}
            className="flex items-center gap-2 rounded-full bg-yt-chip px-4 py-2 text-sm hover:bg-[#3f3f3f]"
          >
            <TrashIcon className="h-5 w-5" /> Xoá tất cả
          </button>
        )}
      </div>

      {!items.length && (
        <EmptyState title={emptyText} actionLabel="Khám phá video" actionHref="/" />
      )}

      <ul className="space-y-4">
        {items.map((v) => (
          <li key={v.id} className="group flex flex-col gap-3 sm:flex-row">
            <Link href={`/watch?v=${v.id}`} className="w-full shrink-0 sm:w-[246px]">
              <Thumb v={v} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/watch?v=${v.id}`} className="line-clamp-2 text-base font-medium">
                {v.title}
              </Link>
              <p className="mt-1 text-xs text-yt-sub">
                {v.author.name}
                {v.viewsText && ` · ${v.viewsText}`}
              </p>
              <p className="text-xs text-yt-sub">Đã lưu {timeAgoFromMs(v.savedAt)}</p>
            </div>
            <button
              onClick={() => { store.remove(storeKey, v.id); refresh(); }}
              className="self-start rounded-full p-2 text-yt-sub opacity-0 transition hover:bg-yt-hover hover:text-yt-text group-hover:opacity-100"
              aria-label="Xoá"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
