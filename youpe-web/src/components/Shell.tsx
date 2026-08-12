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
import DesktopBridge from './DesktopBridge';
import { applyAnimations, getPrefs } from '@/lib/prefs';
import { applyTheme, getActiveTheme } from '@/lib/theme';

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
    /*
      Bảng màu đã được script trong <head> áp trước khi vẽ. Gọi lại ở đây là lưới
      an toàn: script kia nuốt mọi lỗi để không bao giờ chặn trang, nên nếu nó có
      hỏng vì lý do gì thì chỗ này vẫn kéo giao diện về đúng chủ đề.
    */
    applyTheme(getActiveTheme());
  }, []);

  const showMini = !open && !isWatch;

  return (
    <AuthProvider>
      <PlayerHost>
      <TopProgress />
      <Header onToggleMenu={() => setOpen((o) => !o)} />
      <Sidebar open={open} mini={false} />
      {showMini && <Sidebar open={false} mini />}
      {/*
        Lớp phủ duy nhất của cả app — `Sidebar.tsx` từng vẽ thêm một lớp nữa và
        hai cái chồng lên nhau thành gần 80% đen.

        `z-30` để nằm **dưới** sidebar (`z-40`). Đây chính là chỗ từng hỏng: lớp
        phủ để z-40 còn sidebar tụt xuống z-30 ở khoảng 1024–1280px, nên lớp phủ
        đè lên menu và nuốt mất con lăn chuột.

        Làm mờ nhẹ thay vì đen đặc: vẫn đủ tách nền, mà còn nhìn được nội dung
        phía sau nên đỡ cảm giác bị chặn.
      */}
      {open && (
        <button
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 top-14 z-30 bg-black/35 backdrop-blur-[2px] xl:hidden"
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
      <DesktopBridge />
      </PlayerHost>
    </AuthProvider>
  );
}
