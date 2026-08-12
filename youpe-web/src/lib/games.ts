'use client';

/**
 * Mấy trò chơi nhỏ trong app.
 *
 * YouTube có mục Playables nhưng khoá theo vùng và Việt Nam không nằm trong danh
 * sách, mà cũng không có API công khai nào để mượn. Nên đây là hàng tự viết:
 * chạy hoàn toàn trong app, không gọi mạng, không phụ thuộc bên nào.
 *
 * Điểm cao lưu ở localStorage của máy. Cố ý **không** đưa lên Turso: mỗi ván là
 * một lượt ghi, mà gói miễn phí chỉ cho 10 triệu dòng ghi mỗi tháng — xem phần
 * điểm yếu ở docs/CONTEXT.md mục 6.
 */

export type Level = 'de' | 'thuong' | 'kho';

export type Game = {
  slug: string;
  name: string;
  desc: string;
  /** Câu một dòng hiện ở đầu màn chơi, nói cách điều khiển */
  how: string;
};

export const GAMES: Game[] = [
  {
    slug: '2048',
    name: '2048',
    desc: 'Gộp các ô cùng số cho tới khi chạm 2048.',
    how: 'Phím mũi tên hoặc W A S D. Trên màn cảm ứng thì vuốt.',
  },
  {
    slug: 'ran-san-moi',
    name: 'Rắn săn mồi',
    desc: 'Ăn mồi để dài ra, đừng đâm vào tường hay vào chính mình.',
    how: 'Phím mũi tên hoặc W A S D. Space để tạm dừng.',
  },
  {
    slug: 'do-min',
    name: 'Dò mìn',
    desc: 'Mở hết ô trống mà không chạm mìn.',
    how: 'Chuột trái để mở, chuột phải để cắm cờ.',
  },
  {
    slug: 'lat-hinh',
    name: 'Lật hình',
    desc: 'Tìm đủ các cặp giống nhau, càng ít lượt lật càng tốt.',
    how: 'Bấm vào ô để lật.',
  },
  {
    slug: 'ninja',
    name: 'Ninja bóng đêm',
    desc: 'Địch xông từ hai bên. Canh cho vào tầm rồi chém đúng phía.',
    how: 'Mũi tên trái/phải hoặc A/D để chém.',
  },
];

export const findGame = (slug: string) => GAMES.find((g) => g.slug === slug);

/* ---------------- độ khó ---------------- */

/**
 * Mỗi trò khó lên theo một cách khác nhau, nên nhãn phải nói rõ khó ở chỗ nào.
 *
 * Ghi "Dễ / Vừa / Khó" trống không thì người chơi phải đoán — với 2048 thì "khó"
 * nghĩa là bàn **nhỏ đi**, điều chẳng ai đoán ra.
 */
export const LEVELS: Record<string, { id: Level; name: string }[]> = {
  '2048': [
    { id: 'de', name: 'Dễ · bàn 5×5' },
    { id: 'thuong', name: 'Thường · 4×4' },
    { id: 'kho', name: 'Khó · 3×3' },
  ],
  'ran-san-moi': [
    { id: 'de', name: 'Dễ · chậm, xuyên tường' },
    { id: 'thuong', name: 'Thường' },
    { id: 'kho', name: 'Khó · bàn rộng, nhanh' },
  ],
  'do-min': [
    { id: 'de', name: 'Dễ · 9×9, 10 mìn' },
    { id: 'thuong', name: 'Vừa · 13×13, 28 mìn' },
    { id: 'kho', name: 'Khó · 16×16, 45 mìn' },
  ],
  'lat-hinh': [
    { id: 'de', name: 'Dễ · 8 cặp' },
    { id: 'thuong', name: 'Vừa · 12 cặp' },
    { id: 'kho', name: 'Khó · 18 cặp' },
  ],
  ninja: [
    { id: 'de', name: 'Dễ · địch chậm' },
    { id: 'thuong', name: 'Thường' },
    { id: 'kho', name: 'Khó · đông và nhanh' },
  ],
};

const levelKey = (slug: string) => `youpe.game.${slug}.level`;

export function getLevel(slug: string): Level {
  if (typeof window === 'undefined') return 'thuong';
  const v = localStorage.getItem(levelKey(slug));
  return v === 'de' || v === 'kho' ? v : 'thuong';
}

export function setLevel(slug: string, level: Level) {
  try {
    localStorage.setItem(levelKey(slug), level);
  } catch {
    /* bộ nhớ đầy thì thôi */
  }
}

/* ---------------- điểm cao ---------------- */

/**
 * Kỷ lục tính riêng cho từng mức khó.
 *
 * Gộp chung thì kỷ lục đặt ở mức Dễ sẽ chắn mất kỷ lục mức Khó vĩnh viễn — chơi
 * giỏi ở mức khó mà bảng điểm không bao giờ nhúc nhích.
 */
const key = (slug: string, level: Level) => `youpe.game.${slug}.${level}`;

export function getBest(slug: string, level: Level): number {
  if (typeof window === 'undefined') return 0;
  const n = Number(localStorage.getItem(key(slug, level)));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Ghi điểm nếu tốt hơn kỷ lục cũ, trả về kỷ lục sau khi ghi.
 *
 * `lowerIsBetter` cho dò mìn và lật hình — ở đó "điểm" là số giây hoặc số lượt
 * lật, càng nhỏ càng giỏi.
 */
export function saveBest(slug: string, level: Level, score: number, lowerIsBetter = false): number {
  const old = getBest(slug, level);
  const better = old === 0 || (lowerIsBetter ? score < old : score > old);
  if (better && score > 0) {
    try {
      localStorage.setItem(key(slug, level), String(score));
    } catch {
      /* bộ nhớ đầy thì thôi, không đáng để hỏng ván chơi */
    }
    return score;
  }
  return old;
}
