'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { XoilacMatch } from '@/lib/xoilac';

export default function XoilacPage() {
  const [matches, setMatches] = useState<XoilacMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'live' | 'upcoming'>('all');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');

  useEffect(() => {
    let alive = true;
    setLoading(true);

    fetch('/api/xoilac/matches')
      .then((res) => res.json())
      .then((data) => {
        if (alive && data.success && Array.isArray(data.matches)) {
          setMatches(data.matches);
        }
      })
      .catch((err) => console.error('Lỗi nạp danh sách Xoilac:', err))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  const leagues = Array.from(new Set(matches.map((m) => m.league)));

  const filteredMatches = matches.filter((m) => {
    if (filter === 'live' && m.status !== 'live') return false;
    if (filter === 'upcoming' && m.status !== 'upcoming') return false;
    if (leagueFilter !== 'all' && m.league !== leagueFilter) return false;
    return true;
  });

  return (
    <div className="px-4 pb-16 sm:px-6">
      {/* Banner Tiêu đề */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-yt-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-yt-text">
              ⚽ Xôi Lạc TV · Trực Tiếp Bóng Đá
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/20 px-3 py-1 text-xs font-semibold text-red-500 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-red-500"></span>
              TRỰC TIẾP
            </span>
          </div>
          <p className="mt-1 text-sm text-yt-sub">
            Xem các trận đấu Ngoại Hạng Anh, C1, La Liga chất lượng cao với bình luận tiếng Việt.
          </p>
        </div>

        {/* Nút chuyển về YouTube */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-yt-border bg-yt-chip px-4 py-2 text-sm font-medium text-yt-text hover:bg-yt-chip2 transition"
        >
          <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          Chuyển sang YouTube
        </Link>
      </div>

      {/* Bộ Lọc */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            filter === 'all'
              ? 'bg-yt-text text-yt-bg'
              : 'bg-yt-chip text-yt-text hover:bg-yt-chip2'
          }`}
        >
          Tất cả trận ({matches.length})
        </button>
        <button
          onClick={() => setFilter('live')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition flex items-center gap-1.5 ${
            filter === 'live'
              ? 'bg-red-600 text-white'
              : 'bg-yt-chip text-yt-text hover:bg-yt-chip2'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-red-400 animate-ping"></span>
          Đang diễn ra ({matches.filter((m) => m.status === 'live').length})
        </button>
        <button
          onClick={() => setFilter('upcoming')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            filter === 'upcoming'
              ? 'bg-yt-text text-yt-bg'
              : 'bg-yt-chip text-yt-text hover:bg-yt-chip2'
          }`}
        >
          Sắp diễn ra ({matches.filter((m) => m.status === 'upcoming').length})
        </button>

        {leagues.length > 0 && (
          <select
            value={leagueFilter}
            onChange={(e) => setLeagueFilter(e.target.value)}
            className="ml-auto rounded-full bg-yt-chip border border-yt-border px-4 py-1.5 text-sm font-medium text-yt-text outline-none focus:ring-1 focus:ring-yt-sub"
          >
            <option value="all">Tất cả giải đấu</option>
            {leagues.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Danh sách trận đấu */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-yt-border bg-yt-elev p-5 space-y-4">
              <div className="h-4 bg-yt-chip rounded w-1/3"></div>
              <div className="flex justify-between items-center py-4">
                <div className="h-10 w-10 bg-yt-chip rounded-full"></div>
                <div className="h-6 w-16 bg-yt-chip rounded"></div>
                <div className="h-10 w-10 bg-yt-chip rounded-full"></div>
              </div>
              <div className="h-8 bg-yt-chip rounded w-full"></div>
            </div>
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="py-20 text-center text-yt-sub">
          <p className="text-lg font-medium">Không tìm thấy trận đấu nào phù hợp</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMatches.map((m) => (
            <div
              key={m.id}
              className={`relative group rounded-xl border border-yt-border bg-yt-elev p-5 transition hover:border-red-500/50 hover:shadow-lg ${
                m.isHot ? 'ring-1 ring-amber-500/30' : ''
              }`}
            >
              {/* Header Card */}
              <div className="flex items-center justify-between text-xs text-yt-sub border-b border-yt-border/50 pb-3 mb-4">
                <span className="font-semibold text-yt-text tracking-wide">{m.league}</span>
                {m.status === 'live' ? (
                  <span className="inline-flex items-center gap-1 rounded bg-red-600/20 px-2 py-0.5 font-bold text-red-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                    {m.matchTime}
                  </span>
                ) : (
                  <span className="rounded bg-yt-chip px-2 py-0.5">{m.matchTime}</span>
                )}
              </div>

              {/* Chi tiết 2 Đội bóng */}
              <div className="flex items-center justify-between py-2">
                {/* Đội nhà */}
                <div className="flex flex-col items-center gap-2 flex-1 text-center">
                  {m.homeTeam.logo ? (
                    <img
                      src={m.homeTeam.logo}
                      alt={m.homeTeam.name}
                      className="h-12 w-12 object-contain"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-yt-chip flex items-center justify-center font-bold text-yt-sub">
                      {m.homeTeam.name.substring(0, 2)}
                    </div>
                  )}
                  <span className="font-semibold text-sm line-clamp-1">{m.homeTeam.name}</span>
                </div>

                {/* Tỷ số */}
                <div className="px-4 text-center">
                  <span className="text-xl font-extrabold tracking-wider text-red-500 bg-red-500/10 px-3 py-1 rounded-lg">
                    {m.score}
                  </span>
                  {m.commentator && (
                    <span className="block mt-2 text-[11px] text-yt-sub italic">
                      🎙️ {m.commentator}
                    </span>
                  )}
                </div>

                {/* Đội khách */}
                <div className="flex flex-col items-center gap-2 flex-1 text-center">
                  {m.awayTeam.logo ? (
                    <img
                      src={m.awayTeam.logo}
                      alt={m.awayTeam.name}
                      className="h-12 w-12 object-contain"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-yt-chip flex items-center justify-center font-bold text-yt-sub">
                      {m.awayTeam.name.substring(0, 2)}
                    </div>
                  )}
                  <span className="font-semibold text-sm line-clamp-1">{m.awayTeam.name}</span>
                </div>
              </div>

              {/* Nút Xem Trực Tiếp */}
              <div className="mt-5 pt-3 border-t border-yt-border/50">
                <Link
                  href={`/watch?v=${m.id}&source=xoilac`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {m.status === 'live' ? 'Xem Trực Tiếp Ngay' : 'Vào Phòng Xôi Lạc'}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
