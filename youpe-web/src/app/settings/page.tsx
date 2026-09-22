'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPrefs, resetPrefs, setPref, PREF_DEFAULTS, type Prefs } from '@/lib/prefs';
import * as store from '@/lib/storage';
import { clearSubs, getSubs } from '@/lib/subs';
import { clearProgress, getAllProgress } from '@/lib/progress';
import { getPlaylists } from '@/lib/playlists';
import { SearchIcon, TrashIcon, CloseIcon } from '@/components/Icons';
import SyncServer from '@/components/SyncServer';

const HEIGHTS = [360, 480, 720, 1080, 1440, 2160];

/* ------------------------------------------------------------------ */
/* Khai báo các mục cài đặt ở một chỗ.                                  */
/* Ô tìm kiếm lọc thẳng trên danh sách này, nên thêm mục mới là tự tìm  */
/* được, không phải sửa chỗ nào khác.                                   */
/* ------------------------------------------------------------------ */

type Item =
  | { kind: 'quality'; label: string; hint: string }
  | { kind: 'toggle'; key: BoolPref; label: string; hint: string };

/** Các tuỳ chọn kiểu bật/tắt — tách riêng để `Toggle` khỏi phải nhận `maxHeight` */
type BoolPref = {
  [K in keyof Prefs]: Prefs[K] extends boolean ? K : never;
}[keyof Prefs];

type Group = { id: string; title: string; icon: React.ComponentType<{ className?: string }>; items: Item[] };

const GROUPS: Group[] = [
  {
    id: 'playback',
    title: 'Phát video',
    icon: PlayIcon,
    items: [
      {
        kind: 'quality',
        label: 'Chất lượng mặc định',
        hint: 'Chế độ 2 luồng không tự hạ chất lượng khi mạng yếu, nên mức càng cao thì video càng lâu lên hình.',
      },
      {
        kind: 'toggle',
        key: 'autoplayNext',
        label: 'Tự phát video kế tiếp',
        hint: 'Hết video thì đếm ngược 10 giây rồi chuyển sang video đề xuất đầu tiên.',
      },
      {
        kind: 'toggle',
        key: 'forceH264',
        label: 'Chỉ dùng H.264',
        hint: 'Bật nếu video giật hoặc mất tiếng. Máy yếu thường chỉ giải mã H.264 bằng phần cứng.',
      },
    ],
  },
  {
    id: 'pip',
    title: 'Trình phát thu nhỏ',
    icon: PipIcon,
    items: [
      {
        kind: 'toggle',
        key: 'miniOnLeave',
        label: 'Thu nhỏ vào góc khi rời trang xem',
        hint: 'Chuyển sang trang khác thì video thu nhỏ vào góc dưới phải ngay trong app và phát tiếp, thay vì dừng hẳn. Bấm X trên khung đó là tắt hẳn. Muốn tách ra thành cửa sổ nổi riêng của hệ điều hành thì bấm nút cửa sổ nổi trên thanh điều khiển (phím I).',
      },
      {
        kind: 'toggle',
        key: 'keepPipOnVideoChange',
        label: 'Giữ cửa sổ nổi khi đổi video',
        hint: 'Đang xem ở cửa sổ nổi mà chuyển sang video khác thì video mới tự mở lại trong cửa sổ nổi. Tắt đi thì video mới phát bình thường trên trang, cửa sổ nổi tự đóng.',
      },
      {
        kind: 'toggle',
        key: 'playInBackground',
        label: 'Tiếp tục phát khi ẩn cửa sổ',
        hint: 'Thu nhỏ app hoặc chuyển sang tab khác thì video vẫn chạy, không tự dừng.',
      },
    ],
  },
  {
    id: 'ui',
    title: 'Giao diện',
    icon: SparkIcon,
    items: [
      {
        kind: 'toggle',
        key: 'hoverPreview',
        label: 'Xem trước khi rê chuột',
        hint: 'Rê chuột lên thumbnail và giữ khoảng một giây thì phát thử đoạn video, không tiếng. Dùng luồng thấp nhất nhưng vẫn tốn dữ liệu — tắt nếu mạng yếu.',
      },
      {
        kind: 'toggle',
        key: 'animations',
        label: 'Hiệu ứng chuyển động',
        hint: 'Tắt nếu thấy giật khi cuộn trang.',
      },
    ],
  },
];

const SHORTCUTS: [string, string][] = [
  ['/', 'Vào ô tìm kiếm'],
  ['?', 'Mở bảng phím tắt'],
  ['Alt + ← / →', 'Quay lại hoặc tiến tới trang'],
  ['Space hoặc K', 'Phát hoặc dừng'],
  ['J / L', 'Tua 10 giây'],
  ['← / →', 'Tua 5 giây'],
  ['M', 'Tắt tiếng'],
  ['F', 'Toàn màn hình'],
  ['T', 'Chế độ rạp hát'],
  ['C', 'Bật tắt phụ đề'],
  ['I', 'Mở cửa sổ nổi'],
  ['Esc', 'Đóng cửa sổ nổi'],
  ['↑ / ↓', 'Chuyển video ở trang Shorts'],
];

/* ------------------------------------------------------------------ */

/** Bỏ dấu để gõ "cua so noi" vẫn ra "Cửa sổ nổi" */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

/** Đếm dung lượng những gì app đã lưu ở máy (localStorage tính theo UTF-16) */
function usedBytes(): number {
  if (typeof window === 'undefined') return 0;
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith('youpe.')) continue;
    n += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2;
  }
  return n;
}

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

/* ------------------------------------------------------------------ */

type Counts = {
  history: number; later: number; liked: number;
  subs: number; playlists: number; progress: number; bytes: number;
};

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<Counts>({
    history: 0, later: 0, liked: 0, subs: 0, playlists: 0, progress: 0, bytes: 0,
  });

  const refresh = () => {
    setPrefs(getPrefs());
    setCounts({
      history: store.getList('history').length,
      later: store.getList('later').length,
      liked: store.getList('liked').length,
      subs: getSubs().length,
      playlists: getPlaylists().length,
      progress: Object.keys(getAllProgress()).length,
      bytes: usedBytes(),
    });
  };

  useEffect(refresh, []);

  const nq = norm(q.trim());

  /** Lọc theo từ khoá: khớp tên nhóm thì giữ cả nhóm, không thì lọc từng mục */
  const groups = useMemo(() => {
    if (!nq) return GROUPS;
    return GROUPS.map((g) => {
      if (norm(g.title).includes(nq)) return g;
      const items = g.items.filter((i) => norm(`${i.label} ${i.hint}`).includes(nq));
      return { ...g, items };
    }).filter((g) => g.items.length > 0);
  }, [nq]);

  const showSync =
    !nq || norm('Máy chủ đồng bộ server tài khoản thư viện nhiều máy api từ xa').includes(nq);
  const showData = !nq || norm('Dữ liệu lịch sử xem sau đã thích danh sách phát kênh đăng ký tiến độ dung lượng').includes(nq);
  const shortcuts = useMemo(
    () => (!nq ? SHORTCUTS : SHORTCUTS.filter(([k, v]) => norm(`${k} ${v} phim tat`).includes(nq))),
    [nq]
  );

  if (!prefs) return null;

  const update = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPref(k, v);
    refresh();
  };

  const changed = (Object.keys(PREF_DEFAULTS) as (keyof Prefs)[]).filter(
    (k) => prefs[k] !== PREF_DEFAULTS[k]
  ).length;

  const nothingFound =
    groups.length === 0 && !showSync && !showData && shortcuts.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cài đặt</h1>
            <p className="mt-1 text-sm text-yt-sub">
              Mọi thay đổi lưu ngay trên máy này, không cần đăng nhập.
            </p>
          </div>

          <button
            disabled={changed === 0}
            onClick={() => {
              if (confirm('Đưa tất cả tuỳ chọn về mặc định?')) {
                resetPrefs();
                refresh();
              }
            }}
            className="shrink-0 rounded-full border border-yt-border bg-yt-elev px-4 py-2 text-sm font-medium hover:bg-yt-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Khôi phục mặc định
            {changed > 0 && <span className="ml-1.5 text-yt-sub">· {changed}</span>}
          </button>
        </div>

        <div className="search-focus mt-5 flex items-center gap-2 rounded-full border border-yt-border bg-yt-bg2 px-4 py-2.5">
          <SearchIcon className="h-5 w-5 shrink-0 text-yt-sub" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm trong cài đặt"
            aria-label="Tìm trong cài đặt"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-yt-sub"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Xoá ô tìm kiếm"
              className="-mr-1 shrink-0 rounded-full p-1 text-yt-sub hover:bg-yt-hover hover:text-yt-text"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {nothingFound && (
        <p className="rounded-xl border border-yt-border bg-yt-elev px-4 py-8 text-center text-sm text-yt-sub">
          Không có cài đặt nào khớp với “{q}”.
        </p>
      )}

      {groups.map((g) => (
        <Section key={g.id} title={g.title} icon={g.icon}>
          {g.items.map((item) =>
            item.kind === 'quality' ? (
              <Row key="quality" label={item.label} hint={item.hint}>
                <div className="flex flex-wrap gap-2">
                  {HEIGHTS.map((h) => (
                    <button
                      key={h}
                      onClick={() => update('maxHeight', h)}
                      aria-pressed={prefs.maxHeight === h}
                      className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                        prefs.maxHeight === h
                          ? 'chip-active bg-yt-text font-medium text-yt-bg'
                          : 'bg-yt-chip text-yt-text hover:bg-yt-chip2'
                      }`}
                    >
                      {h}p
                    </button>
                  ))}
                </div>
              </Row>
            ) : (
              <Toggle
                key={item.key}
                label={item.label}
                hint={item.hint}
                value={prefs[item.key]}
                onChange={(v) => update(item.key, v)}
              />
            )
          )}
        </Section>
      ))}

      {showSync && (
        <Section title="Máy chủ đồng bộ" icon={CloudIcon}>
          <SyncServer />
        </Section>
      )}

      {showData && (
        <Section title="Dữ liệu" icon={DiskIcon}>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <p className="text-xs text-yt-sub">
              Đang chiếm <span className="font-medium text-yt-text">{fmtBytes(counts.bytes)}</span> trên máy này
            </p>
            <button
              onClick={() => {
                if (!confirm('Xoá toàn bộ dữ liệu: lịch sử, xem sau, đã thích, danh sách phát, kênh đăng ký và tiến độ xem?'))
                  return;
                store.clear('history');
                store.clear('later');
                store.clear('liked');
                clearProgress();
                localStorage.removeItem('youpe.playlistsV2');
                localStorage.removeItem('youpe.subs');
                window.dispatchEvent(new CustomEvent('youpe-playlists'));
                window.dispatchEvent(new CustomEvent('youpe-subs'));
                refresh();
              }}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-yt-sub hover:bg-yt-hover hover:text-yt-red"
            >
              Xoá tất cả
            </button>
          </div>

          <DataRow
            label="Video đã xem"
            count={counts.history}
            unit="video"
            onClear={() => {
              if (confirm('Xoá toàn bộ "Video đã xem"?')) { store.clear('history'); refresh(); }
            }}
          />
          <DataRow
            label="Xem sau"
            count={counts.later}
            unit="video"
            onClear={() => {
              if (confirm('Xoá toàn bộ "Xem sau"?')) { store.clear('later'); refresh(); }
            }}
          />
          <DataRow
            label="Video đã thích"
            count={counts.liked}
            unit="video"
            onClear={() => {
              if (confirm('Xoá toàn bộ "Video đã thích"?')) { store.clear('liked'); refresh(); }
            }}
          />
          <DataRow
            label="Tiến độ xem"
            count={counts.progress}
            unit="video"
            onClear={() => {
              if (confirm('Xoá toàn bộ tiến độ xem? Các video đang xem dở sẽ phát lại từ đầu.')) {
                clearProgress();
                refresh();
              }
            }}
          />
          <DataRow
            label="Danh sách phát"
            count={counts.playlists}
            unit="danh sách"
            onClear={() => {
              if (confirm('Xoá tất cả danh sách phát?')) {
                localStorage.removeItem('youpe.playlistsV2');
                window.dispatchEvent(new CustomEvent('youpe-playlists'));
                refresh();
              }
            }}
          />
          <DataRow
            label="Kênh đăng ký"
            count={counts.subs}
            unit="kênh"
            onClear={() => {
              if (confirm('Bỏ đăng ký tất cả các kênh?')) {
                clearSubs();
                refresh();
              }
            }}
          />
        </Section>
      )}

      {shortcuts.length > 0 && (
        <Section title="Phím tắt" icon={KeyIcon}>
          <div className="grid gap-x-10 px-4 py-1 text-sm sm:grid-cols-2">
            {shortcuts.map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-4 border-b border-yt-border/50 py-2.5 last:border-0 sm:[&:nth-last-child(2)]:border-0"
              >
                <span className="text-yt-sub">{v}</span>
                <kbd className="shrink-0 rounded border border-yt-border bg-yt-chip px-2 py-1 font-mono text-[11px] text-yt-text">
                  {k}
                </kbd>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mảnh ghép giao diện                                                  */
/* ------------------------------------------------------------------ */

/**
 * Một nhóm cài đặt: tiêu đề kèm icon, bên dưới là một thẻ liền mạch.
 * Các dòng bên trong ngăn nhau bằng đường kẻ mảnh thay vì tách rời từng
 * khối — nhìn gọn và bớt rối hơn.
 */
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2.5 px-1 text-sm font-medium uppercase tracking-wide text-yt-sub">
        <Icon className="h-4 w-4" />
        {title}
      </h2>
      <div className="divide-y divide-yt-border/60 overflow-hidden rounded-xl border border-yt-border bg-yt-elev">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-4">
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="mb-3.5 mt-1 text-xs leading-5 text-yt-sub">{hint}</p>}
      {children}
    </div>
  );
}

/**
 * Bấm vào đâu trên dòng cũng bật/tắt được, không phải nhắm đúng cái công tắc bé xíu.
 *
 * Dùng `div` chứ không dùng `button`: CSS chung có `button:active { transform: scale(.94) }`,
 * để nguyên thì cả dòng dài sẽ co giật mỗi lần bấm. Đổi lại phải tự lo bàn phím.
 */
function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      role="switch"
      tabIndex={0}
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!value);
        }
      }}
      className="flex cursor-pointer select-none items-start justify-between gap-6 px-4 py-4 transition-colors hover:bg-yt-hover/70"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-1 text-xs leading-5 text-yt-sub">{hint}</p>}
      </div>

      <div
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? 'bg-yt-blue' : 'bg-yt-off'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </div>
    </div>
  );
}

/** Một dòng trong mục Dữ liệu. Không có gì để xoá thì nút mờ đi và không bấm được. */
function DataRow({
  label,
  count,
  unit,
  onClear,
}: {
  label: string;
  count: number;
  unit: string;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="min-w-0 truncate text-sm">
        {label} <span className="text-yt-sub">· {count} {unit}</span>
      </span>
      <button
        onClick={onClear}
        disabled={count === 0}
        title={`Xoá ${label.toLowerCase()}`}
        aria-label={`Xoá ${label.toLowerCase()}`}
        className="shrink-0 rounded-full p-2 text-yt-sub hover:bg-yt-hover hover:text-yt-red disabled:pointer-events-none disabled:opacity-30"
      >
        <TrashIcon className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

/* ---------- icon riêng cho trang này ---------- */

const Svg = ({ className = 'h-4 w-4', d }: { className?: string; d: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);

function PlayIcon(p: { className?: string }) {
  return <Svg {...p} d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 1a9 9 0 110 18 9 9 0 010-18zm-2 4.5l7 4.5-7 4.5v-9z" />;
}
function PipIcon(p: { className?: string }) {
  return <Svg {...p} d="M3 4h18a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1zm0 1v14h18V5H3zm9 7h7v5h-7v-5z" />;
}
function SparkIcon(p: { className?: string }) {
  return <Svg {...p} d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16.5l-1.9-5.6L4.5 9l5.6-1.4L12 2zm6 12l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6zM5.5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />;
}
function DiskIcon(p: { className?: string }) {
  return <Svg {...p} d="M12 3c4.4 0 8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6c0-1.7 3.6-3 8-3zm0 1c-4 0-7 1.2-7 2s3 2 7 2 7-1.2 7-2-3-2-7-2zM5 8.6V12c0 .8 3 2 7 2s7-1.2 7-2V8.6C17.5 9.5 14.9 10 12 10s-5.5-.5-7-1.4zm0 5V18c0 .8 3 2 7 2s7-1.2 7-2v-4.4c-1.5.9-4.1 1.4-7 1.4s-5.5-.5-7-1.4z" />;
}
function CloudIcon(p: { className?: string }) {
  return <Svg {...p} d="M6.5 19A4.5 4.5 0 015.6 10.1 6 6 0 0117.4 9a4 4 0 01.6 7.95V17H6.5v2zm0-1h11a3 3 0 000-6h-.9l-.1-.9A5 5 0 006.7 10.6l-.1.8-.8.1a3.5 3.5 0 00.7 6.5z" />;
}
function KeyIcon(p: { className?: string }) {
  return <Svg {...p} d="M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zm0 1v10h18V7H3zm2 2h2v2H5V9zm3 0h2v2H8V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zM5 12h2v2H5v-2zm3 0h2v2H8v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2zM7 15h10v2H7v-2z" />;
}
