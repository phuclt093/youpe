import Link from 'next/link';

/**
 * Dấu hiệu nhận diện của youpe — kiểu ấn triện.
 *
 * Khối vuông màu son có khung mảnh bên trong như con dấu đóng trên giấy, giữa là
 * mũi tên phát ghép từ hai nét (không phải tam giác đặc — tránh na ná nhãn hiệu
 * YouTube). Màu phẳng, không chuyển sắc, khớp với icon ứng dụng
 * (`youpe-desktop/build/icon.svg`).
 */
export default function Logo() {
  return (
    <Link href="/" className="group flex select-none items-center gap-2" aria-label="youpe trang chủ">
      <span className="relative grid h-7 w-7 place-items-center rounded-[6px] bg-yt-red transition-transform group-hover:scale-105">
        <span className="pointer-events-none absolute inset-[3px] rounded-[3px] border border-yt-bg/45" />
        <svg viewBox="0 0 24 24" className="relative h-4 w-4" fill="none" aria-hidden>
          <path
            d="M9.5 6.5 L15.5 12 L9.5 17.5"
            stroke="rgb(var(--yt-bg))"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <span className="grad-text text-[20px] font-semibold tracking-[-0.02em]">youpe</span>
      <span className="-mt-2 text-[10px] text-yt-sub">VN</span>
    </Link>
  );
}
