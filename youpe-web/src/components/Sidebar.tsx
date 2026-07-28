'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon, FireIcon, SubsIcon, HistoryIcon, ClockIcon, LikeIcon, PlaylistIcon,
  ShortsIcon,
} from './Icons';
import { EXPLORE_TOPICS } from '@/lib/topics';

const GearIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M9.7 3l-.4 2.6c-.6.2-1.1.5-1.6.9l-2.4-1-2.3 4 2 1.6c0 .3-.1.6-.1.9s0 .6.1.9l-2 1.6 2.3 4 2.4-1c.5.4 1 .7 1.6.9l.4 2.6h4.6l.4-2.6c.6-.2 1.1-.5 1.6-.9l2.4 1 2.3-4-2-1.6c0-.3.1-.6.1-.9s0-.6-.1-.9l2-1.6-2.3-4-2.4 1c-.5-.4-1-.7-1.6-.9L14.3 3H9.7zm2.3 5.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z" />
  </svg>
);

type Item = { href: string; label: string; icon: (p: any) => React.JSX.Element };

const MAIN: Item[] = [
  { href: '/', label: 'Trang chủ', icon: HomeIcon },
  { href: '/shorts', label: 'Shorts', icon: ShortsIcon },
  { href: '/?tab=trending', label: 'Thịnh hành', icon: FireIcon },
  { href: '/?tab=music', label: 'Âm nhạc', icon: SubsIcon },
];

/** Biểu tượng cho từng chủ đề trong mục Khám phá */
const TOPIC_ICON: Record<string, (p: any) => React.JSX.Element> = {
  trending: FireIcon,
  music: SubsIcon,
  gaming: PlaylistIcon,
  movies: PlaylistIcon,
  sports: FireIcon,
  news: HistoryIcon,
  learning: PlaylistIcon,
};

const YOU: Item[] = [
  { href: '/subscriptions', label: 'Kênh đăng ký', icon: SubsIcon },
  { href: '/history', label: 'Video đã xem', icon: HistoryIcon },
  { href: '/later', label: 'Xem sau', icon: ClockIcon },
  { href: '/liked', label: 'Video đã thích', icon: LikeIcon },
  { href: '/playlists', label: 'Danh sách phát', icon: PlaylistIcon },
];

export default function Sidebar({ open, mini }: { open: boolean; mini: boolean }) {
  const path = usePathname();

  if (mini) {
    return (
      <nav className="hidden md:flex fixed left-0 top-14 z-30 w-[72px] flex-col items-center gap-1 pt-1">
        {MAIN.map(({ href, label, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-4 hover:bg-yt-hover"
          >
            <Icon className="h-6 w-6" />
            <span className="text-[10px] leading-tight text-center">{label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-hidden
        />
      )}
      <nav
        className={`fixed left-0 top-14 z-50 h-[calc(100vh-3.5rem)] w-60 overflow-y-auto bg-yt-bg px-3 pb-8 no-scrollbar transition-transform duration-200 ease-out lg:z-30 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Section items={MAIN} path={path} />
        <hr className="my-3 border-yt-border" />
        <p className="px-3 py-1 text-base font-medium">Bạn</p>
        <Section items={YOU} path={path} />
        <hr className="my-3 border-yt-border" />
        <Section
          items={[{ href: '/settings', label: 'Cài đặt', icon: GearIcon }]}
          path={path}
        />
        <hr className="my-3 border-yt-border" />
        <p className="px-3 py-1 text-base font-medium">Khám phá</p>
        <Section
          items={EXPLORE_TOPICS.map((t) => ({
            href: `/?tab=${t.key}`,
            label: t.label,
            icon: TOPIC_ICON[t.key] ?? PlaylistIcon,
          }))}
          path={path}
        />
        <hr className="my-3 border-yt-border" />
        <p className="px-3 pb-3 pt-1 text-xs leading-5 text-yt-sub">
          youpe · dự án cá nhân.
          <br />
          Nội dung thuộc về YouTube và các chủ sở hữu.
        </p>
      </nav>
    </>
  );
}

function Section({ items, path }: { items: Item[]; path: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === path;
        return (
          <li key={label}>
            <Link
              href={href}
              className={`flex items-center gap-6 rounded-lg px-3 py-2 text-sm hover:bg-yt-hover ${
                active ? 'bg-yt-hover font-medium' : ''
              }`}
            >
              <Icon className="h-6 w-6 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
