'use client';

import { useEffect, useState } from 'react';
import { getLevel, setLevel as persist, type Level } from '@/lib/games';

/**
 * Mức khó đang chọn, nhớ lại cho lần sau.
 *
 * Khởi tạo bằng `'thuong'` rồi mới đọc localStorage trong effect, chứ không đọc
 * thẳng lúc dựng state: Next dựng sẵn HTML ở phía server, nơi không có
 * localStorage, nên đọc ngay sẽ lệch giữa lần vẽ đầu của server và của trình
 * duyệt — React kêu hydration mismatch.
 */
export function useLevel(slug: string): [Level, (l: Level) => void] {
  const [level, set] = useState<Level>('thuong');

  useEffect(() => {
    set(getLevel(slug));
  }, [slug]);

  return [
    level,
    (l: Level) => {
      persist(slug, l);
      set(l);
    },
  ];
}
