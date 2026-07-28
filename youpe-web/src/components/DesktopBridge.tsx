'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePlayer } from './PlayerHost';
import * as store from '@/lib/storage';

/**
 * Nối giao diện web với vỏ desktop.
 *
 * Chạy trong trình duyệt thường thì `window.youpeDesktop` không tồn tại và mọi thứ
 * ở đây lặng lẽ không làm gì — đây là lý do component vẫn nằm trong Shell chung
 * thay vì phải tách riêng bản desktop.
 *
 * Ba việc:
 *   1. báo trạng thái phát lên để icon taskbar vẽ thanh tiến trình và huy hiệu
 *   2. gửi danh sách video để dựng menu chuột phải của icon
 *   3. nhận lệnh từ nút taskbar, phím media, và mục trong menu
 */

type Bridge = {
  setPlayback: (s: { playing: boolean; progress: number; title: string }) => void;
  setJumpList: (p: {
    recent: { id: string; title: string; channel: string }[];
    suggested: { id: string; title: string; channel: string }[];
  }) => void;
  onCommand: (fn: (cmd: string) => void) => () => void;
  onNavigate: (fn: (url: string) => void) => () => void;
};

function bridge(): Bridge | null {
  return (globalThis as any).youpeDesktop ?? null;
}

/** Windows cắt tiêu đề dài trong menu, tự cắt trước cho gọn và không lửng lơ */
function short(s: string, max = 60): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export default function DesktopBridge() {
  const router = useRouter();
  const { current, api, close } = usePlayer();

  const lastSent = useRef({ playing: false, bucket: -1 });

  /* ---------- 1. trạng thái phát ---------- */
  useEffect(() => {
    const b = bridge();
    if (!b) return;

    if (!current) {
      b.setPlayback({ playing: false, progress: 0, title: '' });
      lastSent.current = { playing: false, bucket: -1 };
      return;
    }

    const t = setInterval(() => {
      const p = api();
      if (!p) return;

      const playing = p.isPlaying();
      const progress = p.progress();
      // Làm tròn về 100 mức. Thanh tiến trình trên icon chỉ dài vài chục pixel nên
      // gửi mỗi lần đổi mili giây là phí, mà còn làm taskbar nhấp nháy.
      const bucket = Math.round(progress * 100);

      if (playing === lastSent.current.playing && bucket === lastSent.current.bucket) return;
      lastSent.current = { playing, bucket };

      b.setPlayback({ playing, progress, title: short(current.title, 80) });
    }, 1000);

    return () => clearInterval(t);
  }, [current, api]);

  /* ---------- 2. menu chuột phải của icon ---------- */
  useEffect(() => {
    const b = bridge();
    if (!b) return;

    const build = () => {
      const map = (v: { id: string; title: string; author?: { name?: string } }) => ({
        id: v.id,
        title: short(v.title),
        channel: v.author?.name ?? '',
      });

      b.setJumpList({
        recent: store.getList('history').slice(0, 6).map(map),
        // "Gợi ý" ở đây lấy từ danh sách để dành — thứ người dùng đã tự chọn thì
        // đáng tin hơn bất cứ suy đoán nào, và không tốn thêm lượt gọi mạng.
        suggested: store.getList('later').slice(0, 6).map(map),
      });
    };

    build();
    // xem xong một video là danh sách đổi, cập nhật lại
    const t = setInterval(build, 60_000);
    return () => clearInterval(t);
  }, [current]);

  /* ---------- 3. lệnh từ taskbar và phím media ---------- */
  useEffect(() => {
    const b = bridge();
    if (!b) return;

    return b.onCommand((cmd) => {
      const p = api();

      switch (cmd) {
        case 'toggle':
          p?.togglePlay();
          break;
        case 'back10':
        case 'prev':
          p?.seekBy(-10);
          break;
        case 'forward10':
        case 'next':
          p?.seekBy(10);
          break;
        case 'stop':
          close();
          break;
      }
    });
  }, [api, close]);

  /* ---------- 4. mở video từ menu ---------- */
  useEffect(() => {
    const b = bridge();
    if (!b) return;

    return b.onNavigate((url) => router.push(url));
  }, [router]);

  return null;
}
