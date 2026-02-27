/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0d0f14',
          secondary: '#131720',
          card: '#1a1f2e',
          hover: '#1e2436',
        },
        border: {
          DEFAULT: '#2a3347',
          subtle: '#1e2436',
        },
        text: {
          primary: '#f0f4f8',
          secondary: '#8892a4',
          muted: '#4a5568',
        },
        profit: '#10b981',
        loss: '#ef4444',
        accent: '#6366f1',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'card': '0 2px 8px 0 rgb(0 0 0 / 0.4)',
        'card-hover': '0 4px 16px 0 rgb(0 0 0 / 0.5)',
        'profit-glow': '0 4px 14px 0 rgb(16 185 129 / 0.3)',
        'accent-glow': '0 4px 14px 0 rgb(99 102 241 / 0.25)',
      },
    },
  },
  plugins: [],
};
