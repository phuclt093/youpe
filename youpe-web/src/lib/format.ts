export function formatViews(n?: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + ' Tỷ lượt xem';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' Tr lượt xem';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + ' N lượt xem';
  return n + ' lượt xem';
}

export function formatCount(n?: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'Tr';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'N';
  return String(n);
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds && seconds !== 0) return '';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "3 years ago" -> "3 năm trước" (best-effort, YouTube trả text theo locale) */
const UNIT_VI: Record<string, string> = {
  second: 'giây', seconds: 'giây', minute: 'phút', minutes: 'phút',
  hour: 'giờ', hours: 'giờ', day: 'ngày', days: 'ngày',
  week: 'tuần', weeks: 'tuần', month: 'tháng', months: 'tháng',
  year: 'năm', years: 'năm',
};

export function viPublished(text?: string | null): string {
  if (!text) return '';
  const m = text.match(/^(\d+)\s+(\w+)\s+ago$/i);
  if (m && UNIT_VI[m[2].toLowerCase()]) return `${m[1]} ${UNIT_VI[m[2].toLowerCase()]} trước`;
  if (/^streamed/i.test(text)) return text.replace(/^streamed\s*/i, 'Đã phát trực tiếp ');
  return text;
}

export function timeAgoFromMs(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(months / 12)} năm trước`;
}
