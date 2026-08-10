import Link from 'next/link';

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-1 select-none" aria-label="youpe trang chủ">
      {/*
        Giống hệt icon app (`youpe-desktop/build/icon.svg`) — cùng tỉ lệ, cùng toạ
        độ, chỉ bỏ nền vì ở đây đã có nền trang. Sửa một chỗ thì nhớ sửa chỗ kia.
      */}
      <svg viewBox="0 0 1024 1024" className="h-[24px] w-auto" aria-hidden>
        <circle cx="512" cy="512" r="300" fill="#ff0033" />
        <path d="M444 372 L680 512 L444 652 Z" fill="#fff" />
      </svg>
      <span className="text-[20px] font-semibold tracking-[-0.04em] text-yt-text">
        youpe
      </span>
      <span className="text-[10px] text-yt-sub -mt-2">VN</span>
    </Link>
  );
}
