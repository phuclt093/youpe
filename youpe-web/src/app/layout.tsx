import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Shell from '@/components/Shell';
import { themeBootScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'youpe — xem video không quảng cáo',
  description: 'Trình xem YouTube tối giản, không quảng cáo.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        {/*
          Áp bảng màu trước khi trang vẽ lần đầu.

          Phải là script chặn nằm ngay trong <head>: chờ React chạy thì trang đã hiện
          ra bằng màu mặc định mất rồi, đổi sau đó là một cú nháy màu vào mặt — với
          chủ đề sáng thì thành loé trắng.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body className="bg-yt-bg text-yt-text">
        <Suspense fallback={null}>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
