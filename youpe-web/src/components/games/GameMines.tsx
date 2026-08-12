'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GameShell, { GameOver } from './GameShell';
import { useLevel } from './useLevel';
import { getBest, LEVELS, saveBest, type Level } from '@/lib/games';

/**
 * Mật độ mìn tăng dần theo mức: 12%, 17%, 18%.
 *
 * Bàn to mà giữ nguyên mật độ thì chỉ lâu hơn chứ không khó hơn — cái khó của dò
 * mìn nằm ở tỉ lệ mìn trên ô, vì nó quyết định bao nhiêu nước phải đoán mò.
 */
const CFG: Record<Level, { w: number; h: number; mines: number }> = {
  de: { w: 9, h: 9, mines: 10 },
  thuong: { w: 13, h: 13, mines: 28 },
  kho: { w: 16, h: 16, mines: 45 },
};

type Cell = { mine: boolean; near: number; open: boolean; flag: boolean };
type Board = { w: number; h: number; cells: Cell[] };

const at = (b: Board, x: number, y: number) => y * b.w + x;

/** Toạ độ 8 ô kề, đã lọc bỏ phần rơi ra ngoài bàn */
function around(b: Board, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < b.w && ny < b.h) out.push([nx, ny]);
    }
  return out;
}

const blank = (w: number, h: number): Board => ({
  w,
  h,
  cells: Array.from({ length: w * h }, () => ({ mine: false, near: 0, open: false, flag: false })),
});

const copy = (b: Board): Board => ({ ...b, cells: b.cells.map((c) => ({ ...c })) });

/**
 * Rải mìn **sau** cú bấm đầu tiên, tránh xa ô vừa bấm và 8 ô quanh nó.
 *
 * Rải sẵn từ đầu thì có ván bấm phát đầu là chết ngay — thua vì xui chứ không
 * phải vì chơi dở. Cách này cũng bảo đảm nước đầu luôn mở ra một vùng trống.
 */
function plant(b: Board, mines: number, safeX: number, safeY: number): Board {
  const forbidden = new Set([
    at(b, safeX, safeY),
    ...around(b, safeX, safeY).map(([x, y]) => at(b, x, y)),
  ]);

  const spots: number[] = [];
  for (let i = 0; i < b.w * b.h; i++) if (!forbidden.has(i)) spots.push(i);

  for (let i = 0; i < mines && spots.length; i++) {
    const k = Math.floor(Math.random() * spots.length);
    b.cells[spots[k]].mine = true;
    spots.splice(k, 1);
  }

  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      b.cells[at(b, x, y)].near = around(b, x, y).filter(
        ([nx, ny]) => b.cells[at(b, nx, ny)].mine
      ).length;

  return b;
}

/**
 * Mở ô, lan sang các ô trống xung quanh.
 *
 * Dùng ngăn xếp chứ không đệ quy: bàn 16×16 vẫn ổn với đệ quy, nhưng ngăn xếp
 * không đặt ra câu hỏi "bàn to tới đâu thì tràn stack".
 */
function reveal(b: Board, x: number, y: number): Board {
  const stack: [number, number][] = [[x, y]];

  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const c = b.cells[at(b, cx, cy)];
    if (c.open || c.flag) continue;
    c.open = true;
    if (c.near === 0 && !c.mine) stack.push(...around(b, cx, cy));
  }
  return b;
}

/** Màu của con số, theo đúng quy ước quen thuộc của dò mìn */
const NUM = ['', '#4a90d9', '#3f8f4f', '#c9453f', '#5b4bb5', '#a0522d', '#3d9aa1', '#8a8a8a', '#c9a227'];

export default function GameMines() {
  const [level, setLevel] = useLevel('do-min');
  const cfg = CFG[level];

  const [board, setBoard] = useState<Board>(() => blank(9, 9));
  const [started, setStarted] = useState(false);
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [secs, setSecs] = useState(0);
  const [best, setBest] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopClock = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const restart = useCallback(() => {
    stopClock();
    setBoard(blank(cfg.w, cfg.h));
    setStarted(false);
    setDead(false);
    setWon(false);
    setSecs(0);
  }, [cfg.w, cfg.h]);

  useEffect(() => {
    setBest(getBest('do-min', level));
    restart();
    return stopClock;
  }, [level, restart]);

  const open = (x: number, y: number) => {
    if (dead || won) return;

    setBoard((prev) => {
      let next = copy(prev);

      if (!started) {
        next = plant(next, cfg.mines, x, y);
        setStarted(true);
        timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
      }

      const c = next.cells[at(next, x, y)];
      if (c.open || c.flag) return prev;

      if (c.mine) {
        // Lật hết mìn để người chơi thấy mình hụt ở đâu
        next.cells.forEach((k) => {
          if (k.mine) k.open = true;
        });
        setDead(true);
        stopClock();
        return next;
      }

      next = reveal(next, x, y);

      // Thắng khi mọi ô không mìn đã mở — không bắt phải cắm đủ cờ
      if (next.cells.every((k) => k.mine || k.open)) {
        setWon(true);
        stopClock();
        setSecs((s) => {
          setBest(saveBest('do-min', level, s, true));
          return s;
        });
      }
      return next;
    });
  };

  const flag = (x: number, y: number) => {
    if (dead || won) return;
    setBoard((prev) => {
      const next = copy(prev);
      const c = next.cells[at(next, x, y)];
      if (!c.open) c.flag = !c.flag;
      return next;
    });
  };

  const flags = board.cells.filter((c) => c.flag).length;

  return (
    <GameShell
      name="Dò mìn"
      how="Chuột trái để mở, chuột phải để cắm cờ."
      levels={LEVELS['do-min']}
      level={level}
      onLevel={setLevel}
      stats={[
        { label: 'Mìn còn lại', value: Math.max(0, cfg.mines - flags) },
        { label: 'Thời gian', value: `${secs}s` },
        { label: 'Nhanh nhất', value: best ? `${best}s` : '—' },
      ]}
      onRestart={restart}
    >
      <div className="relative mx-auto w-full max-w-[520px] rounded-xl bg-yt-elev p-2">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${board.w}, minmax(0, 1fr))` }}
        >
          {board.cells.map((c, i) => {
            const x = i % board.w;
            const y = Math.floor(i / board.w);

            return (
              <button
                key={i}
                onClick={() => open(x, y)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  flag(x, y);
                }}
                className={`grid aspect-square place-items-center rounded font-bold tabular-nums ${
                  board.w > 13 ? 'text-[11px]' : board.w > 9 ? 'text-xs' : 'text-sm'
                } ${c.open ? 'bg-yt-hover' : 'bg-yt-chip hover:bg-yt-chip2'}`}
                style={{ color: c.open && !c.mine ? NUM[c.near] : undefined }}
              >
                {c.flag && !c.open ? (
                  <span className="text-yt-red">⚑</span>
                ) : c.open && c.mine ? (
                  <span className="text-yt-red">✷</span>
                ) : c.open && c.near > 0 ? (
                  c.near
                ) : (
                  ''
                )}
              </button>
            );
          })}
        </div>

        {dead && <GameOver title="Trúng mìn" onRestart={restart} />}
        {won && <GameOver title="Gỡ sạch mìn" hint={`Hết ${secs} giây`} onRestart={restart} />}
      </div>
    </GameShell>
  );
}
