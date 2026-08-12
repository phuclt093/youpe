'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GameShell, { GameOver } from './GameShell';
import { useLevel } from './useLevel';
import { getBest, LEVELS, saveBest, type Level } from '@/lib/games';

type P = { x: number; y: number };
const same = (a: P, b: P) => a.x === b.x && a.y === b.y;

/**
 * `wrap` là thứ đổi hẳn cảm giác chơi chứ không chỉ đổi tốc độ: chui qua tường
 * rồi hiện ra bên kia thì gần như không thể chết oan, hợp cho mức Dễ.
 */
const CFG: Record<Level, { size: number; start: number; min: number; step: number; wrap: boolean }> = {
  de: { size: 15, start: 200, min: 120, step: 2, wrap: true },
  thuong: { size: 17, start: 160, min: 70, step: 3, wrap: false },
  kho: { size: 21, start: 110, min: 45, step: 4, wrap: false },
};

function randFood(snake: P[], size: number): P {
  // Sinh lại cho tới khi rơi vào ô trống. Bàn nhỏ nhất cũng 15×15 nên gần như
  // không bao giờ phải thử quá vài lần, kể cả lúc rắn đã rất dài.
  let p: P;
  do {
    p = { x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) };
  } while (snake.some((s) => same(s, p)));
  return p;
}

export default function GameSnake() {
  const [level, setLevel] = useLevel('ran-san-moi');
  const cfg = CFG[level];
  const mid = Math.floor(cfg.size / 2);

  const [snake, setSnake] = useState<P[]>([{ x: 8, y: 8 }]);
  const [food, setFood] = useState<P>({ x: 12, y: 8 });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [paused, setPaused] = useState(false);

  /**
   * Hướng đi giữ trong ref chứ không phải state.
   *
   * Vòng lặp game chạy trong `setInterval`; nếu đọc hướng từ state thì nó đọc
   * phải giá trị của lần render lúc interval được tạo, tức là bấm phím xong rắn
   * vẫn đi hướng cũ.
   */
  const dir = useRef<P>({ x: 1, y: 0 });
  /** Hướng thực sự dùng ở nhịp trước, để chặn quay đầu 180 độ */
  const applied = useRef<P>({ x: 1, y: 0 });

  const restart = useCallback(() => {
    const s = [{ x: mid, y: mid }];
    setSnake(s);
    setFood(randFood(s, cfg.size));
    setScore(0);
    setOver(false);
    setPaused(false);
    dir.current = { x: 1, y: 0 };
    applied.current = { x: 1, y: 0 };
  }, [cfg.size, mid]);

  useEffect(() => {
    setBest(getBest('ran-san-moi', level));
    restart();
  }, [level, restart]);

  useEffect(() => {
    const KEYS: Record<string, P> = {
      ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
    };

    const h = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      const d = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!d) return;
      e.preventDefault();
      // Quay ngoắt 180 độ là tự cắn vào cổ mình — chặn luôn cho đỡ ức chế
      if (d.x === -applied.current.x && d.y === -applied.current.y) return;
      dir.current = d;
    };

    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (over || paused) return;

    // Ăn càng nhiều đi càng nhanh, nhưng có sàn để không thành bất khả thi
    const speed = Math.max(cfg.min, cfg.start - score * cfg.step);

    const t = setInterval(() => {
      setSnake((cur) => {
        const d = dir.current;
        applied.current = d;

        let head = { x: cur[0].x + d.x, y: cur[0].y + d.y };

        if (cfg.wrap) {
          head = {
            x: (head.x + cfg.size) % cfg.size,
            y: (head.y + cfg.size) % cfg.size,
          };
        } else if (head.x < 0 || head.y < 0 || head.x >= cfg.size || head.y >= cfg.size) {
          setOver(true);
          setBest(saveBest('ran-san-moi', level, score));
          return cur;
        }

        // Bỏ đuôi ra khỏi phép kiểm tra: nhịp này nó sẽ rời đi, đầu vào đúng ô đó
        // là hợp lệ — không có ngoại lệ này thì rắn dài tự chết một cách vô lý.
        if (cur.slice(0, -1).some((s) => same(s, head))) {
          setOver(true);
          setBest(saveBest('ran-san-moi', level, score));
          return cur;
        }

        const ate = same(head, food);
        const next = [head, ...(ate ? cur : cur.slice(0, -1))];

        if (ate) {
          setScore((s) => s + 1);
          setFood(randFood(next, cfg.size));
        }
        return next;
      });
    }, speed);

    return () => clearInterval(t);
  }, [over, paused, score, food, cfg, level]);

  const headP = snake[0];

  return (
    <GameShell
      name="Rắn săn mồi"
      how="Phím mũi tên hoặc W A S D. Space để tạm dừng."
      levels={LEVELS['ran-san-moi']}
      level={level}
      onLevel={setLevel}
      stats={[
        { label: 'Điểm', value: score },
        { label: 'Kỷ lục', value: best },
        { label: 'Dài', value: snake.length },
      ]}
      onRestart={restart}
      footer={
        paused && !over
          ? 'Đang tạm dừng — bấm Space để chơi tiếp.'
          : cfg.wrap
            ? 'Mức này đi xuyên tường: chạm mép là hiện ra phía đối diện.'
            : undefined
      }
    >
      <div className="relative mx-auto aspect-square w-full max-w-[520px] overflow-hidden rounded-xl bg-yt-elev p-2">
        <div
          className="grid h-full w-full gap-px"
          style={{ gridTemplateColumns: `repeat(${cfg.size}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cfg.size * cfg.size }, (_, i) => {
            const p = { x: i % cfg.size, y: Math.floor(i / cfg.size) };
            const isHead = same(p, headP);
            const isBody = !isHead && snake.some((s) => same(s, p));
            const isFood = same(p, food);

            return (
              <div
                key={i}
                className="rounded-[2px]"
                style={{
                  background: isHead
                    ? 'rgb(var(--yt-text))'
                    : isBody
                      ? 'rgb(var(--yt-blue))'
                      : isFood
                        ? 'rgb(var(--yt-red))'
                        : 'rgb(var(--yt-hover) / .55)',
                }}
              />
            );
          })}
        </div>

        {over && (
          <GameOver title="Toi rồi" hint={`Ăn được ${score} mồi`} onRestart={restart} />
        )}
      </div>
    </GameShell>
  );
}
