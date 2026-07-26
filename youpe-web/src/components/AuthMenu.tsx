'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { HistoryIcon, ClockIcon, LikeIcon, PlaylistIcon, CloseIcon } from './Icons';

const GRADIENTS = [
  'from-[#3ea6ff] to-[#7b61ff]',
  'from-[#ff7a45] to-[#ff0033]',
  'from-[#22c55e] to-[#0ea5e9]',
  'from-[#a855f7] to-[#ec4899]',
];

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const g = GRADIENTS[name.length % GRADIENTS.length];
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${g} font-medium text-white`}
    >
      {initial}
    </div>
  );
}

export default function AuthMenu() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (loading) return <div className="skeleton h-8 w-8 rounded-full" />;

  if (!user) {
    return (
      <>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 rounded-full border border-yt-border px-3 py-1.5 text-sm font-medium text-yt-blue hover:bg-yt-blue/10"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-3 0-8 1.5-8 4.5V21h16v-2.5c0-3-5-4.5-8-4.5z" />
          </svg>
          <span className="hidden sm:inline">Đăng nhập</span>
        </button>
        {modal && <AuthModal onClose={() => setModal(false)} />}
      </>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Tài khoản">
        <Avatar name={user.name} />
      </button>

      {open && (
        <div className="anim-pop absolute right-0 top-11 w-72 origin-top-right overflow-hidden rounded-xl bg-yt-elev py-2 shadow-2xl">
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar name={user.name} size={40} />
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-xs text-yt-sub">{user.email}</p>
            </div>
          </div>
          <hr className="my-1 border-yt-border" />

          {[
            { href: '/history', label: 'Video đã xem', Icon: HistoryIcon },
            { href: '/later', label: 'Xem sau', Icon: ClockIcon },
            { href: '/liked', label: 'Video đã thích', Icon: LikeIcon },
            { href: '/playlists', label: 'Danh sách phát', Icon: PlaylistIcon },
          ].map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-4 px-4 py-2.5 text-sm hover:bg-yt-hover"
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}

          <hr className="my-1 border-yt-border" />
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-4 px-4 py-2.5 text-sm hover:bg-yt-hover"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M11 17l1.4-1.4-2.6-2.6H21v-2H9.8l2.6-2.6L11 7l-5 5 5 5zM4 5h8V3H4a2 2 0 00-2 2v14a2 2 0 002 2h8v-2H4V5z" />
            </svg>
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? 'Có lỗi xảy ra');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full rounded-lg border border-yt-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-yt-blue';

  return (
    <div
      className="anim-fade-in fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-pop w-full max-w-sm rounded-2xl bg-yt-elev p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">
              {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </h2>
            <p className="mt-1 text-xs text-yt-sub">
              Để lịch sử và danh sách của bạn theo được sang thiết bị khác
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-yt-hover" aria-label="Đóng">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <input
              className={field}
              placeholder="Tên hiển thị"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          )}
          <input
            className={field}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className={field}
            type="password"
            placeholder="Mật khẩu (từ 8 ký tự)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />

          {err && <p className="rounded-lg bg-yt-red/15 px-3 py-2 text-sm text-yt-red">{err}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-yt-text py-2.5 text-sm font-medium text-yt-bg hover:bg-white/90 disabled:opacity-60"
          >
            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-yt-sub">
          {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setErr('');
            }}
            className="font-medium text-yt-blue hover:underline"
          >
            {mode === 'login' ? 'Đăng ký' : 'Đăng nhập'}
          </button>
        </p>
      </div>
    </div>
  );
}
