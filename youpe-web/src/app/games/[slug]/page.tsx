'use client';

import { use } from 'react';
import Link from 'next/link';
import Game2048 from '@/components/games/Game2048';
import GameSnake from '@/components/games/GameSnake';
import GameMines from '@/components/games/GameMines';
import GameMemory from '@/components/games/GameMemory';
import GameNinja from '@/components/games/GameNinja';
import { findGame } from '@/lib/games';

const BY_SLUG: Record<string, React.ComponentType> = {
  '2048': Game2048,
  'ran-san-moi': GameSnake,
  'do-min': GameMines,
  'lat-hinh': GameMemory,
  ninja: GameNinja,
};

export default function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const Game = BY_SLUG[slug];

  if (!Game || !findGame(slug)) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-lg font-medium">Không có trò chơi này</p>
        <Link
          href="/games"
          className="mt-4 inline-block rounded-full bg-yt-chip px-4 py-2 text-sm hover:bg-yt-chip2"
        >
          Về danh sách
        </Link>
      </div>
    );
  }

  return <Game />;
}
