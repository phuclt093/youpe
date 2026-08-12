'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GameShell, { GameOver } from './GameShell';
import { useLevel } from './useLevel';
import { getBest, LEVELS, saveBest, type Level } from '@/lib/games';

type Grid = number[][];

/**
 * Bàn nhỏ khó hơn hẳn: ít ô trống nên chỉ vài nước vụng là hết đường đi. Mục
 * tiêu cũng hạ theo, vì 2048 trên bàn 3×3 gần như bất khả thi.
 */
const CFG: Record<Level, { size: number; goal: number }> = {
  de: { size: 5, goal: 2048 },
  thuong: { size: 4, goal: 2048 },
  kho: { size: 3, goal: 512 },
};

const empty = (n: number): Grid => Array.from({ length: n }, () => Array(n).fill(0));

function freeCells(g: Grid) {
  const out: [number, number][] = [];
  for (let r = 0; r < g.length; r++)
    for (let c = 0; c < g.length; c++) if (!g[r][c]) out.push([r, c]);
  return out;
}

function addTile(g: Grid): Grid {
  const free = freeCells(g);
  if (!free.length) return g;
  const [r, c] = free[Math.floor(Math.random() * free.length)];
  // 2048 gốc thả số 4 với xác suất 10% — giữ nguyên cho đúng độ khó
  g[r][c] = Math.random() < 0.9 ? 2 : 4;
  return g;
}

/**
 * Dồn và gộp **một hàng** về bên trái.
 *
 * Cả bốn hướng đều quy về đúng phép này: xoay bàn cờ cho hướng cần đi thành
 * hướng trái, dồn, rồi xoay ngược lại. Viết bốn bản riêng cho bốn hướng là cách
 * chắc chắn nhất để có bốn con bug khác nhau.
 */
function slide(row: number[]): { row: number[]; gained: number } {
  const n = row.length;
  const nums = row.filter(Boolean);
  const out: number[] = [];
  let gained = 0;

  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === nums[i + 1]) {
      // Gộp xong thì ô mới không được gộp tiếp trong cùng một nước
      out.push(nums[i] * 2);
      gained += nums[i] * 2;
      i++;
    } else {
      out.push(nums[i]);
    }
  }

  while (out.length < n) out.push(0);
  return { row: out, gained };
}

/** Xoay bàn cờ 90 độ **theo chiều kim đồng hồ** */
const rotate = (g: Grid): Grid => g[0].map((_, c) => g.map((row) => row[c]).reverse());

/**
 * Số lần xoay ứng với mỗi hướng — **đừng đoán mấy con số này**.
 *
 * `move` xoay bàn cờ `dir` lần theo chiều kim đồng hồ, dồn sang trái, rồi xoay
 * nốt cho tròn 360 độ. Nên `dir` là "xoay bao nhiêu lần để hướng cần đi trở thành
 * hướng trái", và với chiều kim đồng hồ thì **1 lần ra hướng xuống, 3 lần mới ra
 * hướng lên** — ngược với trực giác.
 *
 * Bản đầu gán `lên = 1`, `xuống = 3`, và hai phím dọc chạy ngược nhau.
 */
const LEFT = 0;
const DOWN = 1;
const RIGHT = 2;
const UP = 3;

function move(g: Grid, dir: 0 | 1 | 2 | 3): { grid: Grid; gained: number; moved: boolean } {
  let work = g.map((r) => [...r]);
  for (let i = 0; i < dir; i++) work = rotate(work);

  let gained = 0;
  work = work.map((row) => {
    const r = slide(row);
    gained += r.gained;
    return r.row;
  });

  for (let i = 0; i < (4 - dir) % 4; i++) work = rotate(work);

  const moved = JSON.stringify(work) !== JSON.stringify(g);
  return { grid: work, gained, moved };
}

const canMove = (g: Grid) =>
  freeCells(g).length > 0 || ([LEFT, DOWN, RIGHT, UP] as const).some((d) => move(g, d).moved);

/**
 * Màu ô cố định, không lấy theo chủ đề.
 *
 * Dải màu cát–cam của 2048 là một phần nhận diện của trò này, và vì ô luôn có nền
 * riêng nên nó đọc được trên mọi chủ đề. Chữ thì đảo sang sáng từ ô 8 trở đi cho
 * đủ tương phản.
 */
const TILE: Record<number, string> = {
  2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
  32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
  512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
};

export default function Game2048() {
  const [level, setLevel] = useLevel('2048');
  const { size, goal } = CFG[level];

  const [grid, setGrid] = useState<Grid>(() => empty(4));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const restart = useCallback(() => {
    setGrid(addTile(addTile(empty(size))));
    setScore(0);
    setOver(false);
    setWon(false);
  }, [size]);

  // Đổi mức khó là đổi cỡ bàn, nên phải chơi lại từ đầu
  useEffect(() => {
    setBest(getBest('2048', level));
    restart();
  }, [level, restart]);

  const step = useCallback(
    (dir: 0 | 1 | 2 | 3) => {
      if (over) return;
      setGrid((g) => {
        const r = move(g, dir);
        if (!r.moved) return g;

        addTile(r.grid);

        setScore((s) => {
          const ns = s + r.gained;
          setBest(saveBest('2048', level, ns));
          return ns;
        });

        if (!won && r.grid.some((row) => row.some((v) => v >= goal))) setWon(true);
        if (!canMove(r.grid)) setOver(true);
        return r.grid;
      });
    },
    [over, won, level, goal]
  );

  useEffect(() => {
    const KEYS: Record<string, 0 | 1 | 2 | 3> = {
      ArrowLeft: LEFT, a: LEFT,
      ArrowUp: UP, w: UP,
      ArrowRight: RIGHT, d: RIGHT,
      ArrowDown: DOWN, s: DOWN,
    };
    const h = (e: KeyboardEvent) => {
      const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (dir === undefined) return;
      e.preventDefault(); // không cho mũi tên cuộn trang khi đang chơi
      step(dir);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [step]);

  return (
    <GameShell
      name="2048"
      how="Phím mũi tên hoặc W A S D. Trên màn cảm ứng thì vuốt."
      levels={LEVELS['2048']}
      level={level}
      onLevel={setLevel}
      stats={[
        { label: 'Điểm', value: score },
        { label: 'Kỷ lục', value: best },
        { label: 'Mục tiêu', value: goal },
      ]}
      onRestart={restart}
      footer={won && !over ? `Đã chạm ${goal} — cứ chơi tiếp nếu muốn đi xa hơn.` : undefined}
    >
      <div
        className="relative mx-auto w-full max-w-[440px] touch-none select-none rounded-xl bg-yt-elev p-2.5"
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const t = touch.current;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          // Bỏ qua cú chạm nhẹ, tránh hiểu nhầm cái bấm thành cú vuốt
          if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
          step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
          touch.current = null;
        }}
      >
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(${grid.length}, minmax(0, 1fr))` }}
        >
          {grid.flat().map((v, i) => (
            <div
              key={i}
              className={`grid aspect-square place-items-center rounded-lg font-bold tabular-nums transition-colors ${
                grid.length >= 5 ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
              }`}
              style={{
                background: v ? TILE[v] ?? '#3c3a32' : 'rgb(var(--yt-hover))',
                color: v ? (v >= 8 ? '#f9f6f2' : '#776e65') : 'transparent',
              }}
            >
              {v || ''}
            </div>
          ))}
        </div>

        {over && (
          <GameOver title="Hết nước đi" hint={`Được ${score} điểm`} onRestart={restart} />
        )}
      </div>
    </GameShell>
  );
}
