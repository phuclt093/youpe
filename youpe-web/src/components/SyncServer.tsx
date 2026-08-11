'use client';

import { useEffect, useState } from 'react';
import { apiBase, isRemote, pingApi, setApiBase } from '@/lib/api';

/**
 * Chọn nơi cất tài khoản và thư viện.
 *
 * Bỏ trống  → server chạy ngay trên máy này (mặc định)
 * Có địa chỉ → server dùng chung, máy nào trỏ vào cũng thấy cùng dữ liệu
 *
 * Chỉ tài khoản và thư viện đi xa; video vẫn do máy này tự lấy. Lý do đầy đủ nằm
 * ở đầu `src/lib/api.ts`.
 */
export default function SyncServer() {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    const v = apiBase();
    setValue(v);
    setSaved(v);
  }, []);

  const dirty = value.trim().replace(/\/+$/, '') !== saved;

  const apply = async () => {
    const v = value.trim().replace(/\/+$/, '');

    // Bỏ trống là quay về chế độ trên máy — không có gì để thử kết nối
    if (!v) {
      setApiBase('');
      setSaved('');
      setResult({ ok: true, message: 'Đã chuyển về server trên máy này' });
      return;
    }

    setBusy(true);
    setResult(null);
    const r = await pingApi(v);
    setBusy(false);
    setResult(r);

    /*
      Chỉ lưu khi gọi được thật. Lưu địa chỉ hỏng thì app im lặng mất đồng bộ —
      đúng kiểu lỗi mà cả trang Cài đặt này đang cố tránh.
    */
    if (r.ok) {
      setApiBase(v);
      setSaved(v);
    }
  };

  return (
    <div className="space-y-3 px-4 py-4">
      <div>
        <p className="text-sm font-medium">Máy chủ đồng bộ</p>
        <p className="mt-1 text-xs leading-5 text-yt-sub">
          Bỏ trống thì tài khoản và thư viện nằm trên máy này. Điền địa chỉ một server
          youpe thì mọi máy trỏ vào đó dùng chung dữ liệu — chỉ cần đăng nhập, không
          phải cấu hình database trên từng máy. Video vẫn do máy này tự lấy nên không
          tốn băng thông của server.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setResult(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && dirty && !busy && apply()}
          placeholder="https://youpe.vidu.com"
          spellCheck={false}
          aria-label="Địa chỉ máy chủ đồng bộ"
          className="min-w-0 flex-1 rounded-lg border border-yt-border bg-yt-bg2 px-3 py-2 text-sm outline-none focus:border-yt-blue"
        />
        <button
          onClick={apply}
          disabled={busy || !dirty}
          className="shrink-0 rounded-full bg-yt-chip px-4 py-2 text-sm font-medium hover:bg-yt-chip2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Đang thử…' : 'Lưu và thử'}
        </button>
      </div>

      {result && (
        <p className={`text-xs leading-5 ${result.ok ? 'text-yt-blue' : 'text-yt-red'}`}>
          {result.ok ? '✓' : '✗'} {result.message}
        </p>
      )}

      <p className="text-xs text-yt-sub">
        Đang dùng:{' '}
        <span className="font-medium text-yt-text">
          {isRemote() ? saved : 'server trên máy này'}
        </span>
      </p>

      {!!saved && (
        <p className="text-xs leading-5 text-yt-sub">
          Đổi máy chủ thì phải đăng nhập lại — phiên đăng nhập thuộc về từng server.
        </p>
      )}
    </div>
  );
}
