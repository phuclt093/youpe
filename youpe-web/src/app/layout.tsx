import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'youpe — xem video không quảng cáo',
  description: 'Trình xem YouTube tối giản, không quảng cáo.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-yt-bg text-yt-text">
        <Suspense fallback={null}>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
