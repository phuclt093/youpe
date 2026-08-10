import type { Config } from 'tailwindcss';

/**
 * Màu không viết thẳng mã hex mà trỏ vào biến CSS, để đổi chủ đề chỉ cần gán lại
 * biến trên thẻ `html` — không phải dựng lại CSS, không phải nạp thêm stylesheet.
 *
 * Biến chứa **ba số kênh màu** ("15 15 15") chứ không phải chuỗi "#0f0f0f", vì có
 * vậy `rgb(... / <alpha-value>)` mới hoạt động. Nhờ đó `bg-yt-elev/60` hay
 * `border-yt-border/50` vẫn dùng được y như khi màu viết cứng.
 *
 * Giá trị mặc định nằm ở `globals.css`, các bộ màu khác ở `src/lib/theme.ts`.
 */
const c = (name: string) => `rgb(var(--yt-${name}) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        yt: {
          bg: c('bg'),
          bg2: c('bg2'),
          elev: c('elev'),
          hover: c('hover'),
          chip: c('chip'),
          /** Chip khi rê chuột — trước đây rải rác dưới dạng `bg-[#3f3f3f]` */
          chip2: c('chip2'),
          border: c('border'),
          text: c('text'),
          sub: c('sub'),
          red: c('red'),
          blue: c('blue'),
          /** Nền công tắc lúc tắt */
          off: c('off'),
        },
      },
      fontFamily: {
        yt: ['Roboto', 'Arial', 'system-ui', 'sans-serif'],
        /** Chữ có chân, dùng cho chủ đề cổ phong */
        co: ['"Noto Serif"', 'Charter', 'Georgia', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
