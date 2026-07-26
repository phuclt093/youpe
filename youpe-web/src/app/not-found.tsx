import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-2xl font-bold">Không tìm thấy trang</p>
        <Link href="/" className="mt-4 inline-block rounded-full bg-yt-chip px-4 py-2 text-sm hover:bg-[#3f3f3f]">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
