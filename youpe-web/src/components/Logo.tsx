import Link from 'next/link';

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-1 select-none" aria-label="youpe trang chủ">
      <svg viewBox="0 0 26 26" className="h-[24px] w-auto" aria-hidden>
        <circle cx="13" cy="13" r="11" fill="#ff0033" />
        <path d="M10.5 8.5 L17.5 13 L10.5 17.5 Z" fill="#fff" />
      </svg>
      <span className="text-[20px] font-semibold tracking-[-0.04em] text-yt-text">
        youpe
      </span>
      <span className="text-[10px] text-yt-sub -mt-2">VN</span>
    </Link>
  );
}
