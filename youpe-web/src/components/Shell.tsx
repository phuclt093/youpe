'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import AuthProvider from './AuthProvider';
import TopProgress from './TopProgress';
import BackToTop from './BackToTop';
import Shortcuts from './Shortcuts';
import PlayerHost from './PlayerHost';
import { applyAnimations, getPrefs } from '@/lib/prefs';

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isWatch = path === '/watch';
  const [open, setOpen] = useState(false);

  // Trang thường: sidebar mở trên desktop. Trang watch: luôn ẩn (giống YouTube).
  useEffect(() => {
    if (isWatch) setOpen(false);
    else setOpen(window.innerWidth >= 1280);
  }, [isWatch]);

  // áp dụng tuỳ chọn tắt hiệu ứng ngay khi mở app
  useEffect(() => {
    applyAnimations(getPrefs().animations);
  }, []);

  const showMini = !open && !isWatch;

  return (
    <AuthProvider>
      <PlayerHost>
      <TopProgress />
      <Header onToggleMenu={() => setOpen((o) => !o)} />
      <Sidebar open={open} mini={false} />
      {showMini && <Sidebar open={false} mini />}
      {open && (
        <button
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 top-14 z-40 bg-black/60 xl:hidden"
        />
      )}
      <main
        className={`pt-14 transition-[padding] ${
          isWatch ? '' : open ? 'xl:pl-60' : 'md:pl-[72px]'
        }`}
      >
        {children}
      </main>
      <BackToTop />
      <Shortcuts />
      </PlayerHost>
    </AuthProvider>
  );
}
