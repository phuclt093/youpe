'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon, FireIcon, SubsIcon, HistoryIcon, ClockIcon, LikeIcon, PlaylistIcon,
  ShortsIcon,
} from './Icons';
import { EXPLORE_TOPICS } from '@/lib/topics';

const GamepadIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M7 7h10a5 5 0 014.9 4l.7 4.2A3 3 0 0119.7 19c-1 0-1.9-.5-2.4-1.4L16.4 16H7.6l-.9 1.6A2.8 2.8 0 014.3 19a3 3 0 01-2.9-3.8L2.1 11A5 5 0 017 7zm0 1a4 4 0 00-3.9 3.2l-.7 4.2A2 2 0 004.3 18c.6 0 1.2-.3 1.5-.9L7 15h10l1.2 2.1c.3.6.9.9 1.5.9a2 2 0 001.9-2.6l-.7-4.2A4 4 0 0017 8H7zm1.5 2H10v1.5h1.5V13H10v1.5H8.5V13H7v-1.5h1.5V10zM15.5 10a1 1 0 110 2 1 1 0 010-2zm2 2.5a1 1 0 110 2 1 1 0 010-2z" />
  </svg>
);

const GearIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M9.7 3l-.4 2.6c-.6.2-1.1.5-1.6.9l-2.4-1-2.3 4 2 1.6c0 .3-.1.6-.1.9s0 .6.1.9l-2 1.6 2.3 4 2.4-1c.5.4 1 .7 1.6.9l.4 2.6h4.6l.4-2.6c.6-.2 1.1-.5 1.6-.9l2.4 1 2.3-4-2-1.6c0-.3.1-.6.1-.9s0-.6-.1-.9l2-1.6-2.3-4-2.4 1c-.5-.4-1-.7-1.6-.9L14.3 3H9.7zm2.3 5.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z" />
  </svg>
);

type Item = { href: string; label: string; icon: (p: any) => React.JSX.Element };

const FootballIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2c1.78 0 3.42.58 4.77 1.56L14.7 8.13a2.98 2.98 0 0 0-5.4 0L7.23 5.56C8.58 4.58 10.22 4 12 4zm-6.84 3.73 2.87 2.08a2.98 2.98 0 0 0-1.04 3.21l-3.32.96c-.44-1.22-.67-2.55-.67-3.98 0-.8.08-1.58.23-2.33zM4.6 15.65l3.32-.96a3 3 0 0 0 2.18 2.18v3.46C7.94 19.8 5.86 18.06 4.6 15.65zm9.5 3.68v-3.46a3 3 0 0 0 2.18-2.18l3.32.96c-1.26 2.41-3.34 4.15-5.5 4.68zm5.24-5.35-3.32-.96a2.98 2.98 0 0 0-1.04-3.21l2.87-2.08c.15.75.23 1.53.23 2.33 0 1.43-.23 2.76-.67 3.98z"/>
  </svg>
);

const MAIN: Item[] = [
  { href: '/', label: 'Trang chủ', icon: HomeIcon },
  { href: '/xoilac', label: 'Bóng đá Xoilac', icon: FootballIcon },
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
  /*
    "Trò chơi nhỏ" chứ không phải "Trò chơi": mục Khám phá bên dưới đã có "Trò
    chơi" trỏ tới chủ đề gaming của YouTube. Hai cái trùng tên trong cùng một
    sidebar thì không ai đoán được cái nào ra cái gì.
  */
  { href: '/games', label: 'Trò chơi nhỏ', icon: GamepadIcon },
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
    /*
      Lớp phủ nền nằm ở `Shell.tsx`, không phải ở đây.

      Trước đây cả hai file đều vẽ một lớp: ở đây `bg-black/50 lg:hidden`, bên kia
      `bg-black/60 xl:hidden`. Dưới 1024px thì hai lớp chồng nhau thành gần 80% —
      tối đến mức không đọc nổi chữ. Giữ đúng một lớp, và để nó ở nơi có sẵn hàm
      đóng menu.
    */
    <nav
      /*
        Thứ tự lớp phải cố định, **đừng cho nó đổi theo bề rộng**.

        Bản cũ ghi `z-50 lg:z-30`, trong khi lớp phủ là `z-40 xl:hidden`. Hai mốc
        lệch nhau tạo ra một khoảng chết 1024–1280px: nav tụt xuống z-30 mà lớp
        phủ z-40 thì vẫn còn — lớp phủ đè lên chính cái menu. Con lăn chuột chạm
        vào lớp phủ nên menu không cuộn được, và menu bị nhìn xuyên qua lớp đen
        nên tối thui. Đúng hai lỗi bạn thấy, cùng một nguyên nhân.

        Giờ xếp cứng: lớp phủ 30 < nav 40 < thanh trên 50.
      */
      className={`fixed left-0 top-14 z-40 h-[calc(100vh-3.5rem)] w-60 overflow-y-auto overscroll-contain border-r border-yt-border bg-yt-bg px-3 pb-8 shadow-2xl transition-transform duration-200 ease-out xl:shadow-none ${
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
              className={`flex items-center gap-6 overflow-hidden rounded-lg px-3 py-2 text-sm hover:bg-yt-hover ${
                active ? 'nav-active font-medium' : ''
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
