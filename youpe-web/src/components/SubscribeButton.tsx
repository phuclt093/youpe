'use client';

import { useEffect, useState } from 'react';
import * as subs from '@/lib/subs';
import { BellIcon } from './Icons';

export type SubscribeTarget = {
  id: string;
  name: string;
  avatar: string;
  subsText: string;
};

/**
 * Nút Đăng ký, dùng chung cho trang xem, trang kênh và kết quả tìm kiếm.
 *
 * Trước đây mỗi nơi tự giữ một biến `subbed` rồi tự gọi `toggleSub`. Ba bản sao
 * của cùng một logic, và tệ hơn: chúng không biết gì về nhau. Đăng ký một kênh ở
 * kết quả tìm kiếm thì nút của chính kênh đó trong danh sách video ngay bên dưới
 * vẫn ghi "Đăng ký" cho tới khi tải lại trang.
 *
 * Nút này lắng nghe `onSubsChange` nên mọi bản trên màn hình luôn khớp nhau.
 */
export default function SubscribeButton({
  channel,
  compact = false,
  showBell = false,
  className = '',
}: {
  /** Chưa tải xong thì truyền null — nút tự mờ đi và không bấm được */
  channel: SubscribeTarget | null | undefined;
  compact?: boolean;
  showBell?: boolean;
  className?: string;
}) {
  const id = channel?.id ?? '';
  const [subbed, setSubbed] = useState(false);

  useEffect(() => {
    if (!id) return setSubbed(false);
    const read = () => setSubbed(subs.isSubscribed(id));
    read();
    return subs.onSubsChange(read);
  }, [id]);

  const size = compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  return (
    <button
      disabled={!channel}
      onClick={() => channel && setSubbed(subs.toggleSub(channel))}
      className={`flex items-center gap-2 rounded-full font-medium transition-colors ${size} ${
        subbed
          ? 'bg-yt-chip text-yt-text hover:bg-yt-chip2'
          : /*
              Nút chưa đăng ký dùng nền chuyển sắc thay cho viên thuốc trắng.
              Vừa nổi hơn, vừa bớt giống hệt nút của YouTube — chỗ này là thứ
              người ta nhìn nhiều nhất trên trang xem.
            */
            'grad-accent text-yt-bg hover:opacity-90'
      } disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {showBell && subbed && <BellIcon className="h-4 w-4" />}
      {subbed ? 'Đã đăng ký' : 'Đăng ký'}
    </button>
  );
}
