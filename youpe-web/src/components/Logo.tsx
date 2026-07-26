import Link from 'next/link';

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-1 select-none" aria-label="youpe trang chủ">
      <svg viewBox="0 0 32 22" className="h-[22px] w-auto" aria-hidden>
        <rect x="0" y="0" width="32" height="22" rx="6" fill="#ff0033" />
        <path d="M13 6.5 L22 11 L13 15.5 Z" fill="#fff" />
      </svg>
      <span className="text-[20px] font-semibold tracking-[-0.04em] text-yt-text">
        youpe
      </span>
      <span className="text-[10px] text-yt-sub -mt-2">VN</span>
    </Link>
  );
}
