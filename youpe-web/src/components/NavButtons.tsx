'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BackIcon, ForwardIcon } from './Icons';

/**
 * Nút lùi / tiến.
 *
 * Bản desktop chạy trong cửa sổ Electron không có thanh địa chỉ, nên trước đây
 * không có cách nào quay lại trang trước ngoài bấm logo về trang chủ. Electron
 * cũng không tự hiểu Alt+← hay nút lùi trên chuột như trình duyệt — phải tự bắt.
 *
 * Biết còn lùi được không nhờ Navigation API (Chromium ≥ 102, có sẵn trong
 * Electron). Trình duyệt chưa có API đó thì đoán bằng `history.length`.
 * Mở app thẳng vào một trang con (từ Jump List chẳng hạn) thì không có lịch sử:
 * nút lùi lúc đó đưa về trang chủ thay vì nằm im.
 */
export default function NavButtons() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);

  const refresh = useCallback(() => {
    const nav = (window as any).navigation;
    if (nav && typeof nav.canGoBack === 'boolean') {
      setCanBack(nav.canGoBack);
      setCanFwd(nav.canGoForward);
    } else {
      setCanBack(window.history.length > 1);
      setCanFwd(false);
    }
  }, []);

  // đổi trang (kể cả chỉ đổi ?q=) thì tính lại
  useEffect(refresh, [pathname, params, refresh]);

  useEffect(() => {
    const nav = (window as any).navigation;
    nav?.addEventListener?.('currententrychange', refresh);
    window.addEventListener('popstate', refresh);
    return () => {
      nav?.removeEventListener?.('currententrychange', refresh);
      window.removeEventListener('popstate', refresh);
    };
  }, [refresh]);

  const atHome = pathname === '/';
  const backEnabled = canBack || !atHome;

  const back = useCallback(() => {
    if (canBack) router.back();
    else if (!atHome) router.push('/');
  }, [canBack, atHome, router]);

  const forward = useCallback(() => {
    if (canFwd) router.forward();
  }, [canFwd, router]);

  // Alt+← / Alt+→ và hai nút phụ bên hông chuột
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        forward();
      }
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        back();
      } else if (e.button === 4) {
        e.preventDefault();
        forward();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  }, [back, forward]);

  const base =
    'grid h-9 w-9 place-items-center rounded-full text-yt-text hover:bg-yt-hover disabled:pointer-events-none disabled:text-yt-sub/40';

  return (
    <div className="flex items-center gap-0.5">
      <button onClick={back} disabled={!backEnabled} className={base} aria-label="Quay lại" title="Quay lại (Alt+←)">
        <BackIcon className="h-5 w-5" />
      </button>
      <button
        onClick={forward}
        disabled={!canFwd}
        className={`${base} hidden sm:grid`}
        aria-label="Tiến tới"
        title="Tiến tới (Alt+→)"
      >
        <ForwardIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
