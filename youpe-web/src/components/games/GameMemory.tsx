'use client';

import { useCallback, useEffect, useState } from 'react';
import GameShell, { GameOver } from './GameShell';
import { useLevel } from './useLevel';
import { getBest, LEVELS, saveBest, type Level } from '@/lib/games';

/**
 * Kho ký hiệu, chọn loại hình khối rõ ràng thay vì emoji.
 *
 * Emoji vẽ khác nhau trên từng hệ điều hành và có cái gần như trùng nhau ở cỡ
 * nhỏ — trò này sống nhờ việc phân biệt được hình trong nháy mắt. Mức Khó cần 18
 * ký hiệu nên danh sách phải đủ dài mà vẫn không có cặp nào dễ nhầm.
 */
const MARKS = [
  '●', '■', '▲', '◆', '★', '✿', '♠', '♥', '♣',
  '♦', '☀', '☾', '⚑', '⌘', '✈', '⚓', '☘', '✂',
];

const CFG: Record<Level, { pairs: number; cols: number }> = {
  de: { pairs: 8, cols: 4 },
  thuong: { pairs: 12, cols: 6 },
  kho: { pairs: 18, cols: 6 },
};

type Card = { id: number; mark: string; open: boolean; done: boolean };

function deal(pairs: number): Card[] {
  const picked = MARKS.slice(0, pairs);
  const deck = [...picked, ...picked].map((mark, id) => ({ id, mark, open: false, done: false }));

  // Trộn Fisher–Yates. `sort(() => Math.random() - .5)` trông gọn hơn nhưng cho
  // kết quả lệch, và với vài chục lá thì mắt thường nhận ra được.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export default function GameMemory() {
  const [level, setLevel] = useLevel('lat-hinh');
  const cfg = CFG[level];

  const [cards, setCards] = useState<Card[]>([]);
  const [flips, setFlips] = useState(0);
  const [best, setBest] = useState(0);
  const [locked, setLocked] = useState(false);

  const restart = useCallback(() => {
    setCards(deal(cfg.pairs));
    setFlips(0);
    setLocked(false);
  }, [cfg.pairs]);

  useEffect(() => {
    setBest(getBest('lat-hinh', level));
    restart();
  }, [level, restart]);

  const won = cards.length > 0 && cards.every((c) => c.done);

  useEffect(() => {
    if (won) setBest(saveBest('lat-hinh', level, flips, true));
  }, [won, flips, level]);

  const click = (id: number) => {
    if (locked || won) return;

    const card = cards.find((c) => c.id === id);
    if (!card || card.open || card.done) return;

    const opened = cards.filter((c) => c.open && !c.done);
    setCards(cards.map((c) => (c.id === id ? { ...c, open: true } : c)));
    setFlips((f) => f + 1);

    if (opened.length === 0) return;

    /*
      Đã có một lá đang mở, đây là lá thứ hai.

      Khớp thì đánh dấu xong luôn. Không khớp thì khoá bàn 700ms rồi úp lại —
      không khoá thì bấm nhanh sẽ mở được ba bốn lá cùng lúc và trò chơi vô nghĩa.
    */
    const first = opened[0];
    setLocked(true);

    if (first.mark === card.mark) {
      setCards((cur) =>
        cur.map((c) => (c.id === id || c.id === first.id ? { ...c, done: true, open: true } : c))
      );
      setLocked(false);
      return;
    }

    setTimeout(() => {
      setCards((cur) =>
        cur.map((c) => (c.id === id || c.id === first.id ? { ...c, open: false } : c))
      );
      setLocked(false);
    }, 700);
  };

  const found = cards.filter((c) => c.done).length / 2;

  return (
    <GameShell
      name="Lật hình"
      how="Bấm vào ô để lật. Tìm đủ các cặp giống nhau."
      levels={LEVELS['lat-hinh']}
      level={level}
      onLevel={setLevel}
      stats={[
        { label: 'Số lượt lật', value: flips },
        { label: 'Cặp đã tìm', value: `${found}/${cfg.pairs}` },
        { label: 'Ít nhất', value: best || '—' },
      ]}
      onRestart={restart}
    >
      <div className="relative mx-auto w-full max-w-[480px] rounded-xl bg-yt-elev p-3">
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` }}
        >
          {cards.map((c) => {
            const shown = c.open || c.done;
            return (
              <button
                key={c.id}
                onClick={() => click(c.id)}
                aria-label={shown ? `Đã lật: ${c.mark}` : 'Lá úp'}
                className={`grid aspect-square place-items-center rounded-lg transition-colors ${
                  cfg.cols > 4 ? 'text-xl sm:text-2xl' : 'text-3xl'
                } ${
                  c.done
                    ? 'bg-yt-blue/20 text-yt-blue'
                    : shown
                      ? 'bg-yt-hover text-yt-text'
                      : 'bg-yt-chip text-transparent hover:bg-yt-chip2'
                }`}
              >
                {shown ? c.mark : '•'}
              </button>
            );
          })}
        </div>

        {won && (
          <GameOver title="Xong hết" hint={`Mất ${flips} lượt lật`} onRestart={restart} />
        )}
      </div>
    </GameShell>
  );
}
