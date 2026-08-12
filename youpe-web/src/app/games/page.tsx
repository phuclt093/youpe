'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GAMES, getBest, getLevel, LEVELS } from '@/lib/games';

/** Hình xem trước, vẽ bằng ô vuông cho khớp với chính trò đó */
function Preview({ slug }: { slug: string }) {
  const box = 'rounded-[3px]';

  if (slug === '2048')
    return (
      <div className="grid h-full w-full grid-cols-3 gap-1.5 p-3">
        {['#eee4da', '#ede0c8', '#f2b179', '#f59563', '#f67c5f', '#edcf72', '#edc850', '#edc22e', '#f65e3b'].map(
          (c, i) => <div key={i} className={box} style={{ background: c }} />
        )}
      </div>
    );

  if (slug === 'ran-san-moi') {
    const body = new Set([6, 7, 8, 13, 18, 19]);
    return (
      <div className="grid h-full w-full grid-cols-5 gap-1 p-3">
        {Array.from({ length: 25 }, (_, i) => (
          <div
            key={i}
            className={box}
            style={{
              background:
                i === 5
                  ? 'rgb(var(--yt-text))'
                  : body.has(i)
                    ? 'rgb(var(--yt-blue))'
                    : i === 22
                      ? 'rgb(var(--yt-red))'
                      : 'rgb(var(--yt-hover))',
            }}
          />
        ))}
      </div>
    );
  }

  if (slug === 'do-min')
    return (
      <div className="grid h-full w-full grid-cols-5 gap-1 p-3 text-[11px] font-bold">
        {['1', '', '2', '', '', '', '1', '', '⚑', '', '2', '', '3', '', '1', '', '', '', '2', '', '1', '', '1', '', ''].map(
          (t, i) => (
            <div
              key={i}
              className={`${box} grid place-items-center`}
              style={{
                background: t ? 'rgb(var(--yt-hover))' : 'rgb(var(--yt-chip))',
                color: t === '⚑' ? 'rgb(var(--yt-red))' : 'rgb(var(--yt-sub))',
              }}
            >
              {t}
            </div>
          )
        )}
      </div>
    );

  if (slug === 'ninja')
    return (
      <div className="relative h-full w-full">
        {/* mặt đất */}
        <div className="absolute inset-x-0 bottom-[26%] h-px bg-yt-sub/40" />
        {/* hai tên địch và ninja ở giữa, vẽ bằng người que rất tối giản */}
        {[
          { left: '16%', color: 'rgb(var(--yt-sub))', h: 22 },
          { left: '50%', color: 'rgb(var(--yt-text))', h: 26 },
          { left: '82%', color: 'rgb(var(--yt-sub))', h: 22 },
        ].map((s, i) => (
          <div
            key={i}
            className="absolute bottom-[26%] -translate-x-1/2"
            style={{ left: s.left, height: s.h }}
          >
            <div
              className="mx-auto rounded-full"
              style={{ width: 6, height: 6, background: s.color }}
            />
            <div className="mx-auto" style={{ width: 2, height: s.h - 12, background: s.color }} />
            <div
              className="mx-auto"
              style={{
                width: 10,
                height: 2,
                background: s.color,
                transform: 'rotate(20deg)',
              }}
            />
          </div>
        ))}
        {/* vệt chém */}
        <div
          className="absolute bottom-[34%] left-1/2 h-6 w-6 rounded-full border-2 border-transparent"
          style={{ borderRightColor: 'rgb(var(--yt-blue))' }}
        />
      </div>
    );

  return (
    <div className="grid h-full w-full grid-cols-4 gap-1.5 p-3 text-sm">
      {['●', '', '■', '', '', '▲', '', '★', '◆', '', '', '■', '', '●', '✿', ''].map((m, i) => (
        <div
          key={i}
          className={`${box} grid place-items-center`}
          style={{
            background: m ? 'rgb(var(--yt-hover))' : 'rgb(var(--yt-chip))',
            color: m ? 'rgb(var(--yt-blue))' : 'transparent',
          }}
        >
          {m || '•'}
        </div>
      ))}
    </div>
  );
}

export default function GamesPage() {
  /** Kỷ lục hiện ở đây là của **mức khó đang chọn**, kèm tên mức cho khỏi nhầm */
  const [bests, setBests] = useState<Record<string, { score: number; level: string }>>({});

  // Đọc sau khi dựng xong, tránh lệch giữa server và trình duyệt
  useEffect(() => {
    setBests(
      Object.fromEntries(
        GAMES.map((g) => {
          const lv = getLevel(g.slug);
          const name = LEVELS[g.slug]?.find((l) => l.id === lv)?.name ?? '';
          return [g.slug, { score: getBest(g.slug, lv), level: name }];
        })
      )
    );
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Trò chơi</h1>
        <p className="mt-1 text-sm text-yt-sub">
          Vài trò nhỏ để giết thời gian. Chạy hoàn toàn trong app, không cần mạng,
          điểm lưu ngay trên máy này.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {GAMES.map((g, i) => (
          <Link
            key={g.slug}
            href={`/games/${g.slug}`}
            style={{ animationDelay: `${i * 40}ms` }}
            className="grad-ring anim-fade-up group overflow-hidden rounded-xl border border-yt-border bg-yt-elev transition-colors"
          >
            <div className="aspect-[16/9] bg-yt-bg2">
              <Preview slug={g.slug} />
            </div>
            <div className="p-4">
              <p className="font-medium">{g.name}</p>
              <p className="mt-1 text-sm leading-5 text-yt-sub">{g.desc}</p>
              <p className="mt-2 text-xs text-yt-sub">
                {bests[g.slug]?.score ? (
                  <>
                    Kỷ lục{' '}
                    <span className="font-medium text-yt-text">{bests[g.slug].score}</span>
                    {bests[g.slug].level && ` · ${bests[g.slug].level}`}
                  </>
                ) : (
                  'Ba mức khó'
                )}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
