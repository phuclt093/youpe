import Link from 'next/link';

/**
 * Dấu hiệu nhận diện của youpe.
 *
 * Bản đầu là **hình tròn đỏ + tam giác trắng** — đặt cạnh chữ thì đọc gần như
 * nhãn hiệu YouTube, và đó là rủi ro thật chứ không phải chuyện thẩm mỹ. Bản này
 * cố ý đi hướng khác: khối bo góc, chuyển sắc theo chủ đề, và hình bên trong là
 * **mũi tên phát ghép từ hai nét chéo** chứ không phải tam giác đặc.
 *
 * Màu lấy từ biến chủ đề nên mỗi bộ màu cho ra một logo khác — cổ phong ra son
 * và ngọc, Hoa linh ra hồng và ngọc lam.
 */
export default function Logo() {
  return (
    <Link href="/" className="group flex select-none items-center gap-2" aria-label="youpe trang chủ">
      <span className="grad-accent grid h-7 w-7 place-items-center rounded-[9px] shadow-sm transition-transform group-hover:scale-105">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
          <path
            d="M9 6.5 L16 12 L9 17.5"
            stroke="rgb(var(--yt-bg))"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <span className="grad-text text-[20px] font-semibold tracking-[-0.04em]">youpe</span>
      <span className="-mt-2 text-[10px] text-yt-sub">VN</span>
    </Link>
  );
}
