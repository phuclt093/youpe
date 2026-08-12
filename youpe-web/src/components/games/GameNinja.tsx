'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GameShell, { GameOver } from './GameShell';
import { useLevel } from './useLevel';
import { getBest, LEVELS, saveBest, type Level } from '@/lib/games';
import { onThemeChange } from '@/lib/theme';

/* ---------------- thông số ---------------- */

/** Toạ độ trong game, không phải pixel màn hình — canvas tự co giãn theo khung */
const W = 720;
const H = 260;
const GROUND = H - 46;
const ME = W / 2;

/** Chém trúng khi địch nằm trong khoảng này tính từ ninja */
const REACH = 96;
/** Gần hơn mức này là chết */
const DEADLY = 30;
/** Nhát chém hiện trên màn bao lâu */
const SLASH_MS = 130;

const CFG: Record<Level, { spawn: number; min: number; max: number; whiff: number }> = {
  de: { spawn: 1500, min: 55, max: 85, whiff: 220 },
  thuong: { spawn: 1050, min: 85, max: 125, whiff: 340 },
  kho: { spawn: 700, min: 115, max: 175, whiff: 460 },
};

/**
 * `side` là **địch đứng bên nào**, không phải hướng nó đi.
 *
 * Hai thứ ngược nhau: kẻ ở bên trái (`-1`) phải chạy sang phải mới tới được chỗ
 * ninja. Bản đầu dùng thẳng `side` làm hướng, thế là cả đám lùi ra khỏi màn hình
 * và ván nào cũng bất tử. Hướng đi luôn là `-side`.
 */
type Foe = {
  side: -1 | 1;
  x: number;
  speed: number;
  /**
   * Sống hay đã bị chém. Cờ riêng chứ không suy ra từ bộ đếm hiệu ứng.
   *
   * Bản đầu chỉ có một số `dying`: 0 là còn sống, dương là đang tan biến. Nhưng
   * số đó đếm lùi **qua 0 xuống âm**, mà điều kiện bỏ qua lại là `dying > 0` —
   * nên xác chết sống dậy, đi tiếp, và giết người chơi. Tệ hơn: nhánh vẽ đòi
   * đúng `dying === 0` nên nó vô hình. Chết vì một kẻ không nhìn thấy.
   */
  alive: boolean;
  /** Đếm lùi hiệu ứng tan biến, chỉ dùng khi đã chết */
  fade: number;
};

type World = {
  foes: Foe[];
  slash: { side: -1 | 1; t: number } | null;
  /** Còn bao nhiêu ms nữa mới chém lại được, sau một nhát hụt */
  lock: number;
  nextSpawn: number;
  score: number;
  combo: number;
  best: number;
  dead: boolean;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ---------------- vẽ ---------------- */

type Palette = { text: string; sub: string; red: string; blue: string; line: string };

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => `rgb(${css.getPropertyValue(`--yt-${n}`).trim() || '255 255 255'})`;
  return {
    text: v('text'),
    sub: v('sub'),
    red: v('red'),
    blue: v('blue'),
    line: `rgb(${css.getPropertyValue('--yt-sub').trim() || '170 170 170'} / .35)`,
  };
}

/**
 * Người que.
 *
 * `lean` nghiêng thân theo hướng đi, `phase` cho chân đung đưa — hai thứ rẻ tiền
 * nhưng đủ để đám địch trông như đang chạy chứ không phải trượt trên băng.
 */
function stick(
  g: CanvasRenderingContext2D,
  x: number,
  color: string,
  opts: { lean?: number; phase?: number; scale?: number; band?: string } = {}
) {
  const { lean = 0, phase = 0, scale = 1, band } = opts;
  const h = 46 * scale;
  const head = 7 * scale;
  const hipY = GROUND - h * 0.45;
  const shoulderY = GROUND - h * 0.85;

  g.save();
  g.translate(x, 0);
  g.rotate(lean * 0.06);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 2.5 * scale;
  g.lineCap = 'round';

  g.beginPath();
  g.arc(0, shoulderY - head - 2, head, 0, Math.PI * 2);
  g.fill();

  g.beginPath();
  g.moveTo(0, shoulderY);
  g.lineTo(0, hipY);
  g.stroke();

  const swing = Math.sin(phase) * 9 * scale;
  g.beginPath();
  g.moveTo(0, hipY);
  g.lineTo(-swing, GROUND);
  g.moveTo(0, hipY);
  g.lineTo(swing, GROUND);
  g.stroke();

  g.beginPath();
  g.moveTo(0, shoulderY + 3);
  g.lineTo(-swing * 0.7, shoulderY + 16 * scale);
  g.moveTo(0, shoulderY + 3);
  g.lineTo(swing * 0.7, shoulderY + 16 * scale);
  g.stroke();

  // dải khăn bay ngược chiều chạy — chỉ ninja mới có
  if (band) {
    g.strokeStyle = band;
    g.lineWidth = 2 * scale;
    g.beginPath();
    g.moveTo(0, shoulderY - head - 2);
    g.quadraticCurveTo(-14 * scale, shoulderY - head - 8, -24 * scale, shoulderY - head + 2);
    g.stroke();
  }

  g.restore();
}

/* ---------------- game ---------------- */

export default function GameNinja() {
  const [level, setLevel] = useLevel('ninja');
  const cfg = CFG[level];

  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World>({
    foes: [], slash: null, lock: 0, nextSpawn: 900,
    score: 0, combo: 0, best: 0, dead: false,
  });
  const palette = useRef<Palette | null>(null);

  // Chỉ những gì cần hiện lên thanh thông số mới nằm ở state React. Toàn bộ phần
  // còn lại ở trong ref: vòng lặp chạy 60 khung/giây, đẩy hết vào state là React
  // dựng lại cây giao diện 60 lần mỗi giây cho không.
  const [ui, setUi] = useState({ score: 0, combo: 0, best: 0, dead: false });

  const restart = useCallback(() => {
    world.current = {
      foes: [], slash: null, lock: 0, nextSpawn: 900,
      score: 0, combo: 0, best: getBest('ninja', level), dead: false,
    };
    setUi({ score: 0, combo: 0, best: getBest('ninja', level), dead: false });
  }, [level]);

  useEffect(() => {
    restart();
  }, [level, restart]);

  /** Chém về một phía */
  const strike = useCallback(
    (side: -1 | 1) => {
      const w = world.current;
      if (w.dead || w.lock > 0) return;

      w.slash = { side, t: SLASH_MS };

      // Địch gần nhất bên đó, còn sống, và đã vào tầm
      const hit = w.foes
        .filter((f) => f.side === side && f.alive && Math.abs(f.x - ME) <= REACH)
        .sort((a, b) => Math.abs(a.x - ME) - Math.abs(b.x - ME))[0];

      if (hit) {
        hit.alive = false;
        hit.fade = 260;
        w.score++;
        w.combo++;
        w.best = saveBest('ninja', level, w.score);
      } else {
        /*
          Chém hụt thì khoá tay một nhịp.

          Không có hình phạt này thì cách chơi tối ưu là bấm loạn hai phím — trò
          chơi biến thành cuộc thi bấm nhanh, và mọi thứ về canh thời điểm đều vô
          nghĩa.
        */
        w.lock = cfg.whiff;
        w.combo = 0;
      }
    },
    [cfg.whiff, level]
  );

  /* bàn phím */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') {
        e.preventDefault();
        strike(-1);
      } else if (k === 'arrowright' || k === 'd') {
        e.preventDefault();
        strike(1);
      } else if (k === 'r' && world.current.dead) {
        restart();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [strike, restart]);

  /* màu theo chủ đề — đọc một lần, đọc lại khi đổi chủ đề */
  useEffect(() => {
    palette.current = readPalette();
    return onThemeChange(() => {
      palette.current = readPalette();
    });
  }, []);

  /* vòng lặp */
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const g = el.getContext('2d');
    if (!g) return;

    let raf = 0;
    let last = performance.now();
    let phase = 0;

    const fit = () => {
      // Vẽ theo toạ độ game rồi để canvas tự phóng; nhân devicePixelRatio cho nét
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = W * dpr;
      el.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);

      const dt = Math.min(now - last, 50); // nhảy khung sau khi ẩn tab thì kẹp lại
      last = now;
      const w = world.current;
      const p = palette.current ?? readPalette();

      if (!w.dead) {
        phase += dt * 0.012;
        if (w.lock > 0) w.lock -= dt;
        if (w.slash) {
          w.slash.t -= dt;
          if (w.slash.t <= 0) w.slash = null;
        }

        /* sinh địch — càng ghi điểm càng ra dày */
        w.nextSpawn -= dt;
        if (w.nextSpawn <= 0) {
          const ramp = Math.max(0.45, 1 - w.score * 0.012);
          w.nextSpawn = cfg.spawn * ramp * rand(0.75, 1.25);
          const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
          w.foes.push({
            side,
            x: side === -1 ? -30 : W + 30,
            speed: rand(cfg.min, cfg.max) * (1 + w.score * 0.01),
            alive: true,
            fade: 0,
          });
        }

        /* di chuyển */
        for (const f of w.foes) {
          if (!f.alive) {
            f.fade -= dt;
            continue;
          }
          f.x -= f.side * f.speed * (dt / 1000); // đi về phía ninja, ngược với `side`

          /*
            Kiểm tra "đã qua vạch chưa", không phải "có đang ở gần không".

            `Math.abs(f.x - ME) < DEADLY` chỉ đúng khi địch còn chậm. Về sau tốc
            độ tăng theo điểm, tới lúc nào đó một khung hình đi hơn 60px là nó
            nhảy thẳng qua vùng chết mà không khung nào bắt được — rồi đi tuốt ra
            mép kia, bất tử và vô hại. So sánh một chiều thì đã qua là qua luôn.
          */
          const passed = f.side === -1 ? f.x >= ME - DEADLY : f.x <= ME + DEADLY;
          if (passed) {
            w.dead = true;
            w.best = saveBest('ninja', level, w.score);
          }
        }
        w.foes = w.foes.filter((f) => f.alive || f.fade > 0);
      }

      /* ---- vẽ ---- */
      g.clearRect(0, 0, W, H);

      g.strokeStyle = p.line;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, GROUND + 1);
      g.lineTo(W, GROUND + 1);
      g.stroke();

      // vệt tầm chém, mờ đi khi đang bị khoá tay
      g.strokeStyle = p.line;
      g.lineWidth = 1;
      g.globalAlpha = w.lock > 0 ? 0.25 : 0.6;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(ME + s * REACH, GROUND - 54);
        g.lineTo(ME + s * REACH, GROUND);
        g.stroke();
      }
      g.globalAlpha = 1;

      for (const f of w.foes) {
        if (f.alive) {
          // nghiêng theo hướng chạy, mà hướng chạy là `-side`
          stick(g, f.x, p.sub, { lean: -f.side, phase, scale: 1 });
        } else {
          // ngã văng ra xa ninja
          g.globalAlpha = Math.max(0, f.fade / 260);
          stick(g, f.x, p.red, { lean: f.side * 6, phase: 0, scale: 1 });
          g.globalAlpha = 1;
        }
      }

      stick(g, ME, w.lock > 0 ? p.sub : p.text, {
        phase: 0,
        scale: 1.15,
        band: w.lock > 0 ? p.sub : p.red,
      });

      if (w.slash) {
        const k = w.slash.t / SLASH_MS;
        g.strokeStyle = p.blue;
        g.lineWidth = 3.5;
        g.globalAlpha = k;
        g.beginPath();
        g.arc(ME, GROUND - 26, REACH * (1.1 - k * 0.25),
          w.slash.side === 1 ? -0.9 : Math.PI + 0.35,
          w.slash.side === 1 ? 0.35 : Math.PI + 0.9);
        g.stroke();
        g.globalAlpha = 1;
      }

      // Đồng bộ sang React thưa thôi — chỉ khi con số thật sự đổi
      setUi((old) =>
        old.score === w.score && old.combo === w.combo && old.dead === w.dead && old.best === w.best
          ? old
          : { score: w.score, combo: w.combo, best: w.best, dead: w.dead }
      );
    };

    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, [cfg, level]);

  return (
    <GameShell
      name="Ninja bóng đêm"
      how="Mũi tên trái/phải hoặc A/D để chém. Bấm vào nửa trái hoặc nửa phải màn hình cũng được."
      levels={LEVELS['ninja']}
      level={level}
      onLevel={setLevel}
      stats={[
        { label: 'Hạ được', value: ui.score },
        { label: 'Chuỗi', value: ui.combo },
        { label: 'Kỷ lục', value: ui.best },
      ]}
      onRestart={restart}
      footer="Chém hụt thì bị khoá tay một nhịp — canh cho địch vào tầm rồi hãy ra đòn."
    >
      <div className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-xl bg-yt-elev">
        <canvas
          ref={canvas}
          className="block w-full touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            strike(e.clientX - r.left < r.width / 2 ? -1 : 1);
          }}
        />

        {ui.dead && (
          <GameOver title="Bị áp sát" hint={`Hạ được ${ui.score} tên`} onRestart={restart} />
        )}
      </div>
    </GameShell>
  );
}
