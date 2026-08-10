'use client';

import { useEffect, useState } from 'react';
import {
  COLOR_KEYS, COLOR_LABELS, deleteTheme, duplicateTheme, getActiveId, getAllThemes,
  isPreset, onThemeChange, setActiveTheme, updateTheme, type Theme,
} from '@/lib/theme';
import { CheckIcon, TrashIcon } from './Icons';

/**
 * Chọn và chỉnh bảng màu.
 *
 * Bộ dựng sẵn thì khoá, không cho sửa — sửa được thì lỡ tay là mất luôn bản gốc,
 * chẳng còn gì để quay về. Muốn đổi thì nhân bản rồi chỉnh trên bản sao.
 */
export default function ThemePicker() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeId, setId] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const refresh = () => {
    setThemes(getAllThemes());
    setId(getActiveId());
  };

  useEffect(() => {
    refresh();
    return onThemeChange(refresh);
  }, []);

  const active = themes.find((t) => t.id === activeId);
  const editable = active && !isPreset(active.id);

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {themes.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            active={t.id === activeId}
            onPick={() => setActiveTheme(t.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (!active) return;
            const copy = duplicateTheme(active);
            setActiveTheme(copy.id);
            setEditing(copy.id);
          }}
          className="rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-yt-chip2"
        >
          Tạo bộ mới từ bộ đang dùng
        </button>

        {editable && (
          <>
            <button
              onClick={() => setEditing((e) => (e === active!.id ? null : active!.id))}
              className="rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-yt-chip2"
            >
              {editing === active.id ? 'Xong' : 'Chỉnh màu'}
            </button>
            <button
              onClick={() => {
                if (confirm(`Xoá bộ màu “${active.name}”?`)) {
                  deleteTheme(active.id);
                  setEditing(null);
                }
              }}
              title="Xoá bộ màu này"
              aria-label="Xoá bộ màu này"
              className="rounded-full p-2 text-yt-sub hover:bg-yt-hover hover:text-yt-red"
            >
              <TrashIcon className="h-[18px] w-[18px]" />
            </button>
          </>
        )}

        {!editable && (
          <p className="text-xs text-yt-sub">Bộ dựng sẵn không sửa được — tạo bản sao để chỉnh.</p>
        )}
      </div>

      {editable && editing === active.id && <Editor theme={active} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Ô xem thử: một khung nhỏ vẽ đúng bằng màu của bộ đó, không phụ thuộc chủ đề
 * đang bật. Đọc tên màu thì chẳng ai hình dung được, phải nhìn.
 */
function ThemeCard({
  theme, active, onPick,
}: {
  theme: Theme;
  active: boolean;
  onPick: () => void;
}) {
  const c = theme.colors;
  return (
    <button
      onClick={onPick}
      aria-pressed={active}
      className={`overflow-hidden rounded-xl border text-left transition-colors ${
        active ? 'border-yt-blue' : 'border-yt-border hover:border-yt-sub'
      }`}
    >
      <div className="space-y-1.5 p-2.5" style={{ background: c.bg }}>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.red }} />
          <span className="h-1.5 flex-1 rounded-full" style={{ background: c.chip }} />
        </div>
        <div className="h-9 rounded-md" style={{ background: c.elev }} />
        <div className="h-1.5 w-4/5 rounded-full" style={{ background: c.text, opacity: 0.85 }} />
        <div className="h-1.5 w-2/5 rounded-full" style={{ background: c.sub, opacity: 0.7 }} />
      </div>

      <div className="flex items-center justify-between gap-2 bg-yt-elev px-2.5 py-2">
        <span className="truncate text-xs font-medium">{theme.name}</span>
        {active && <CheckIcon className="h-4 w-4 shrink-0 text-yt-blue" />}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */

function Editor({ theme }: { theme: Theme }) {
  return (
    <div className="space-y-4 rounded-xl border border-yt-border bg-yt-bg2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-yt-sub">
          Tên
          <input
            value={theme.name}
            onChange={(e) => updateTheme(theme.id, { name: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-yt-border bg-yt-elev px-3 py-1.5 text-sm text-yt-text outline-none focus:border-yt-blue"
          />
        </label>

        {/*
          Không đoán sáng/tối từ độ sáng của màu nền: người dùng có thể cố tình làm
          bộ tối nhàn nhạt. Cho chọn thẳng, vì cờ này quyết định trình duyệt vẽ
          thanh cuộn và ô nhập của hệ thống theo kiểu nào.
        */}
        <label className="flex items-center gap-2 text-xs text-yt-sub">
          Kiểu
          <select
            value={theme.scheme}
            onChange={(e) => updateTheme(theme.id, { scheme: e.target.value as 'dark' | 'light' })}
            className="rounded-lg border border-yt-border bg-yt-elev px-2 py-1.5 text-sm text-yt-text outline-none focus:border-yt-blue"
          >
            <option value="dark">Tối</option>
            <option value="light">Sáng</option>
          </select>
        </label>

        <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-yt-sub">
          <input
            type="checkbox"
            checked={theme.serif}
            onChange={(e) => updateTheme(theme.id, { serif: e.target.checked })}
            className="h-4 w-4 accent-[rgb(var(--yt-blue))]"
          />
          Chữ có chân
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {COLOR_KEYS.map((k) => (
          <ColorRow
            key={k}
            label={COLOR_LABELS[k]}
            value={theme.colors[k]}
            onChange={(v) => updateTheme(theme.id, { colors: { [k]: v } })}
          />
        ))}
      </div>

      <p className="text-xs leading-5 text-yt-sub">
        Màu đổi ngay khi bạn kéo, không cần lưu. Bộ màu này chỉ nằm trên máy bạn.
      </p>
    </div>
  );
}

function ColorRow({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  /*
    Ô hex có state riêng: gõ dở dang ("#a8") mà đẩy thẳng ra ngoài thì giao diện
    nhấp nháy loạn xạ theo từng ký tự. Chỉ báo ra khi đã đủ 3 hoặc 6 chữ số.
  */
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const commit = (v: string) => {
    setText(v);
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())) onChange(v.trim());
  };

  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-yt-elev px-3 py-2">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-7 w-7 shrink-0 cursor-pointer rounded border border-yt-border bg-transparent p-0"
      />
      <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
      <input
        value={text}
        onChange={(e) => commit(e.target.value)}
        spellCheck={false}
        aria-label={`${label} — mã màu`}
        className="w-[86px] shrink-0 rounded border border-yt-border bg-yt-bg2 px-2 py-1 font-mono text-[11px] uppercase text-yt-text outline-none focus:border-yt-blue"
      />
    </div>
  );
}
