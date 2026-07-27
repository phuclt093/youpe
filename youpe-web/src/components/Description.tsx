'use client';

import { useState } from 'react';
import { usePlayer } from './PlayerHost';
import { viPublished } from '@/lib/format';

/**
 * Mô tả video.
 *
 * Việc đáng làm nhất ở đây là biến các mốc thời gian thành nút bấm được — mô tả
 * kiểu "00:00 Mở đầu / 12:34 Phần chính" rất phổ biến mà trước đó chỉ là chữ thường.
 * Đường dẫn cũng được tách ra thành liên kết mở ở tab mới.
 */

/** Bắt 1:23 và 1:02:03, phải đứng đầu dòng hoặc sau khoảng trắng */
const TIMESTAMP = /(?<=^|\s)(\d{1,2}:\d{2}(?::\d{2})?)(?=\s|$|[)\]-])/g;
const URL_RE = /(https?:\/\/[^\s<>"]+)/g;

function toSeconds(stamp: string): number {
  const parts = stamp.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return -1;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return -1;
}

export default function Description({
  text,
  viewsText,
  publishedText,
}: {
  text: string;
  viewsText?: string;
  publishedText?: string;
}) {
  const [open, setOpen] = useState(false);
  const { seek } = usePlayer();

  return (
    <div className="mt-4 rounded-xl bg-yt-elev p-3 text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left font-medium"
      >
        {viewsText}
        {viewsText && publishedText ? ' · ' : ''}
        {viPublished(publishedText ?? '')}
      </button>

      <div
        className={`mt-2 whitespace-pre-wrap break-words leading-5 ${
          open ? '' : 'line-clamp-3'
        }`}
      >
        {renderRich(text, seek)}
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-2 font-medium text-yt-sub hover:text-yt-text"
      >
        {open ? 'Ẩn bớt' : '…thêm'}
      </button>
    </div>
  );
}

/** Tách chuỗi thành các đoạn chữ, mốc thời gian và liên kết */
function renderRich(text: string, seek: (t: number) => void) {
  if (!text) return null;

  const out: React.ReactNode[] = [];
  let key = 0;

  for (const line of text.split('\n')) {
    const pieces: React.ReactNode[] = [];
    let last = 0;

    // gom cả hai kiểu khớp rồi sắp theo vị trí, tránh chồng lấn
    const marks: { start: number; end: number; kind: 'time' | 'url'; raw: string }[] = [];

    for (const m of line.matchAll(TIMESTAMP)) {
      if (m.index == null) continue;
      marks.push({ start: m.index, end: m.index + m[0].length, kind: 'time', raw: m[0] });
    }
    for (const m of line.matchAll(URL_RE)) {
      if (m.index == null) continue;
      marks.push({ start: m.index, end: m.index + m[0].length, kind: 'url', raw: m[0] });
    }
    marks.sort((a, b) => a.start - b.start);

    for (const mk of marks) {
      if (mk.start < last) continue; // nằm trong đoạn đã xử lý
      if (mk.start > last) pieces.push(line.slice(last, mk.start));

      if (mk.kind === 'time') {
        const sec = toSeconds(mk.raw);
        pieces.push(
          sec >= 0 ? (
            <button
              key={key++}
              onClick={() => seek(sec)}
              className="text-yt-blue hover:underline"
            >
              {mk.raw}
            </button>
          ) : (
            mk.raw
          )
        );
      } else {
        pieces.push(
          <a
            key={key++}
            href={mk.raw}
            target="_blank"
            rel="noreferrer noopener"
            className="text-yt-blue hover:underline"
          >
            {mk.raw.length > 60 ? mk.raw.slice(0, 60) + '…' : mk.raw}
          </a>
        );
      }
      last = mk.end;
    }

    if (last < line.length) pieces.push(line.slice(last));
    out.push(<span key={key++}>{pieces}</span>, <br key={key++} />);
  }

  return out;
}
