'use client';

import { useEffect, useState } from 'react';
import { getPrefs, setPref, type Prefs } from '@/lib/prefs';
import * as store from '@/lib/storage';
import { getSubs } from '@/lib/subs';
import { clearProgress, getAllProgress } from '@/lib/progress';
import { getPlaylists } from '@/lib/playlists';

const HEIGHTS = [360, 480, 720, 1080, 1440, 2160];

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [counts, setCounts] = useState({
    history: 0, later: 0, liked: 0, subs: 0, playlists: 0, progress: 0,
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
    });
  };

  useEffect(refresh, []);

  if (!prefs) return null;

  const update = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPref(k, v);
    refresh();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Cài đặt</h1>
        <p className="mt-1 text-sm text-yt-sub">
          Mọi thay đổi lưu ngay trên máy này, không cần đăng nhập.
        </p>
      </header>

      <Section title="Phát video">
        <Row
          label="Chất lượng mặc định"
          hint="Chế độ 2 luồng không tự hạ chất lượng khi mạng yếu, nên mức càng cao thì video càng lâu lên hình."
        >
          <div className="flex flex-wrap gap-2">
            {HEIGHTS.map((h) => (
              <button
                key={h}
                onClick={() => update('maxHeight', h)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  prefs.maxHeight === h
                    ? 'bg-yt-text font-medium text-yt-bg'
                    : 'bg-yt-chip hover:bg-[#3f3f3f]'
                }`}
              >
                {h}p
              </button>
            ))}
          </div>
        </Row>

        <Toggle
          label="Tự phát video kế tiếp"
          hint="Hết video thì đếm ngược 10 giây rồi chuyển sang video đề xuất đầu tiên."
          value={prefs.autoplayNext}
          onChange={(v) => update('autoplayNext', v)}
        />

        <Toggle
          label="Chỉ dùng H.264"
          hint="Bật nếu video giật hoặc mất tiếng. Máy yếu thường chỉ giải mã H.264 bằng phần cứng."
          value={prefs.forceH264}
          onChange={(v) => update('forceH264', v)}
        />
      </Section>

      <Section title="Cửa sổ nhỏ">
        <Toggle
          label="Thu nhỏ khi rời trang xem"
          hint="Chuyển sang trang khác thì video co lại thành cửa sổ nhỏ ở góc màn hình thay vì dừng hẳn. Kéo thanh tiêu đề để di chuyển, kéo góc trái dưới để đổi cỡ."
          value={prefs.miniOnLeave}
          onChange={(v) => update('miniOnLeave', v)}
        />

        <Toggle
          label="Tiếp tục phát khi ẩn cửa sổ"
          hint="Thu nhỏ app hoặc chuyển sang tab khác thì video vẫn chạy, không tự dừng."
          value={prefs.playInBackground}
          onChange={(v) => update('playInBackground', v)}
        />
      </Section>

      <Section title="Giao diện">
        <Toggle
          label="Xem trước khi rê chuột"
          hint="Rê chuột lên thumbnail và giữ khoảng một giây thì phát thử đoạn video, không tiếng. Dùng luồng thấp nhất nhưng vẫn tốn dữ liệu — tắt nếu mạng yếu."
          value={prefs.hoverPreview}
          onChange={(v) => update('hoverPreview', v)}
        />

        <Toggle
          label="Hiệu ứng chuyển động"
          hint="Tắt nếu thấy giật khi cuộn trang."
          value={prefs.animations}
          onChange={(v) => update('animations', v)}
        />
      </Section>

      <Section title="Dữ liệu">
        <div className="space-y-2 text-sm">
          {(
            [
              ['history', 'Video đã xem', counts.history],
              ['later', 'Xem sau', counts.later],
              ['liked', 'Video đã thích', counts.liked],
            ] as const
          ).map(([key, label, n]) => (
            <div key={key} className="flex items-center justify-between rounded-lg bg-yt-elev px-4 py-3">
              <span>
                {label} <span className="text-yt-sub">· {n} video</span>
              </span>
              <button
                onClick={() => {
                  if (confirm(`Xoá toàn bộ "${label}"?`)) {
                    store.clear(key);
                    refresh();
                  }
                }}
                className="rounded-full bg-yt-chip px-3 py-1.5 hover:bg-[#3f3f3f]"
              >
                Xoá
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-lg bg-yt-elev px-4 py-3">
            <span>
              Tiến độ xem <span className="text-yt-sub">· {counts.progress} video</span>
            </span>
            <button
              onClick={() => {
                if (confirm('Xoá toàn bộ tiến độ xem? Các video đang xem dở sẽ phát lại từ đầu.')) {
                  clearProgress();
                  refresh();
                }
              }}
              className="rounded-full bg-yt-chip px-3 py-1.5 hover:bg-[#3f3f3f]"
            >
              Xoá
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-yt-elev px-4 py-3">
            <span>
              Danh sách phát <span className="text-yt-sub">· {counts.playlists} danh sách</span>
            </span>
            <button
              onClick={() => {
                if (confirm('Xoá tất cả danh sách phát?')) {
                  localStorage.removeItem('youpe.playlistsV2');
                  window.dispatchEvent(new CustomEvent('youpe-playlists'));
                  refresh();
                }
              }}
              className="rounded-full bg-yt-chip px-3 py-1.5 hover:bg-[#3f3f3f]"
            >
              Xoá
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-yt-elev px-4 py-3">
            <span>
              Kênh đăng ký <span className="text-yt-sub">· {counts.subs} kênh</span>
            </span>
            <button
              onClick={() => {
                if (confirm('Bỏ đăng ký tất cả các kênh?')) {
                  localStorage.removeItem('youpe.subs');
                  window.dispatchEvent(new CustomEvent('youpe-subs'));
                  refresh();
                }
              }}
              className="rounded-full bg-yt-chip px-3 py-1.5 hover:bg-[#3f3f3f]"
            >
              Xoá
            </button>
          </div>
        </div>
      </Section>

      <Section title="Phím tắt">
        <div className="rounded-lg bg-yt-elev p-4">
          <div className="grid gap-x-10 text-sm sm:grid-cols-2">
            {[
              ['/', 'Vào ô tìm kiếm'],
              ['?', 'Mở bảng phím tắt'],
              ['Space hoặc K', 'Phát hoặc dừng'],
              ['J / L', 'Tua 10 giây'],
              ['← / →', 'Tua 5 giây'],
              ['M', 'Tắt tiếng'],
              ['F', 'Toàn màn hình'],
              ['T', 'Chế độ rạp hát'],
              ['C', 'Bật tắt phụ đề'],
              ['I', 'Thu nhỏ cửa sổ'],
              ['Esc', 'Đóng cửa sổ nhỏ'],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-4 border-b border-yt-border/60 py-2 last:border-0"
              >
                <span className="text-yt-sub">{v}</span>
                <kbd className="shrink-0 rounded bg-yt-chip px-2 py-1 font-mono text-[11px]">
                  {k}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-base font-medium text-yt-sub">{title}</h2>
      <div className="space-y-3">{children}</div>
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
    <div className="rounded-lg bg-yt-elev p-4">
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="mb-3 mt-1 text-xs leading-5 text-yt-sub">{hint}</p>}
      {children}
    </div>
  );
}

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
    <div className="flex items-start justify-between gap-6 rounded-lg bg-yt-elev p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-1 text-xs leading-5 text-yt-sub">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? 'bg-yt-blue' : 'bg-[#5a5a5a]'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
