'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Logo from './Logo';
import AuthMenu from './AuthMenu';
import { MenuIcon, SearchIcon, MicIcon, CloseIcon, HistoryIcon } from './Icons';

export default function Header({ onToggleMenu }: { onToggleMenu: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [sugs, setSugs] = useState<string[]>([]);
  const [openSug, setOpenSug] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  useEffect(() => {
    if (!q.trim()) {
      setSugs([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setSugs(j.suggestions ?? []);
      } catch {}
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenSug(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // "/" nhảy vào ô tìm kiếm, Esc thoát ra — giống YouTube
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === '/' && !typing) {
        e.preventDefault();
        setMobileSearch(true);
        inputRef.current?.focus();
      } else if (e.key === 'Escape' && typing) {
        inputRef.current?.blur();
        setOpenSug(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const go = (term: string) => {
    const t = term.trim();
    if (!t) return;
    setOpenSug(false);
    setMobileSearch(false);
    router.push(`/results?q=${encodeURIComponent(t)}`);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-4 bg-yt-bg px-4">
      {/* trái */}
      <div className={`flex items-center gap-4 ${mobileSearch ? 'hidden sm:flex' : 'flex'}`}>
        <button
          onClick={onToggleMenu}
          className="rounded-full p-2 hover:bg-yt-hover"
          aria-label="Mở menu"
        >
          <MenuIcon />
        </button>
        <Logo />
      </div>

      {/* giữa: search */}
      <div
        ref={boxRef}
        className={`${mobileSearch ? 'flex' : 'hidden sm:flex'} flex-1 items-center justify-center gap-2 max-w-[732px]`}
      >
        {mobileSearch && (
          <button className="rounded-full p-2 hover:bg-yt-hover sm:hidden" onClick={() => setMobileSearch(false)}>
            <CloseIcon />
          </button>
        )}
        <div className="relative flex w-full">
          <div className="search-focus flex w-full items-center rounded-l-full border border-yt-border bg-[#121212] px-4">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpenSug(true);
              }}
              onFocus={() => setOpenSug(true)}
              onKeyDown={(e) => e.key === 'Enter' && go(q)}
              placeholder="Tìm kiếm  ( / )"
              className="h-10 w-full bg-transparent text-base outline-none placeholder:text-[#888]"
            />
            {q && (
              <button onClick={() => setQ('')} className="p-1 text-yt-sub hover:text-white">
                <CloseIcon className="h-5 w-5" />
              </button>
            )}
          </div>
          <button
            onClick={() => go(q)}
            aria-label="Tìm kiếm"
            className="flex w-16 items-center justify-center rounded-r-full border border-l-0 border-yt-border bg-yt-elev hover:bg-yt-hover"
          >
            <SearchIcon className="h-5 w-5" />
          </button>

          {openSug && sugs.length > 0 && (
            <ul className="anim-pop absolute left-0 right-16 top-11 origin-top overflow-hidden rounded-xl bg-yt-elev py-2 shadow-2xl">
              {sugs.map((s) => (
                <li key={s}>
                  <button
                    onMouseDown={() => go(s)}
                    className="flex w-full items-center gap-4 px-4 py-1.5 text-left text-base hover:bg-yt-hover"
                  >
                    <HistoryIcon className="h-5 w-5 shrink-0 text-yt-sub" />
                    <span className="truncate">{s}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="hidden rounded-full bg-yt-elev p-2.5 hover:bg-yt-hover sm:block" aria-label="Tìm bằng giọng nói">
          <MicIcon className="h-5 w-5" />
        </button>
      </div>

      {/* phải */}
      <div className={`flex items-center gap-2 ${mobileSearch ? 'hidden' : 'flex'}`}>
        <button
          className="rounded-full p-2 hover:bg-yt-hover sm:hidden"
          onClick={() => setMobileSearch(true)}
          aria-label="Tìm kiếm"
        >
          <SearchIcon />
        </button>
        <AuthMenu />
      </div>
    </header>
  );
}
