import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        yt: {
          bg: '#0f0f0f',
          bg2: '#181818',
          elev: '#212121',
          hover: '#272727',
          chip: '#272727',
          border: '#303030',
          text: '#f1f1f1',
          sub: '#aaaaaa',
          red: '#ff0033',
          blue: '#3ea6ff',
        },
      },
      fontFamily: {
        yt: ['Roboto', 'Arial', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
