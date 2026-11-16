import colors from 'tailwindcss/colors';

// Every color comes from a CSS variable (src/styles/tokens.css), so the dark theme is a
// change of variables, not a second set of classes:
//  - gray         slate-tinted, inverted in the dark theme (gray-900 text stays readable)
//  - indigo       the K-Zion brand scale (every existing indigo-* class follows it)
//  - status hues  tints (50–200) and dark text (700–900) swap for dark tints / light text
//  - surfaces     canvas, surface, line, fg, ink… the names new code uses
const v = name => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, steps) => Object.fromEntries(steps.map(s => [s, v(`${name}-${s}`)]));
const FULL = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const HUE_STEPS = [50, 100, 200, 700, 800, 900];
const HUES = ['emerald', 'green', 'red', 'rose', 'amber', 'yellow', 'orange', 'blue', 'sky', 'cyan', 'teal', 'purple', 'violet', 'pink', 'lime'];

const brand = scale('indigo', FULL);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        gray: scale('gray', FULL),
        indigo: brand,
        brand,
        ...Object.fromEntries(HUES.map(h => [h, { ...colors[h], ...scale(h, HUE_STEPS) }])),
        canvas: v('canvas'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        fg: { DEFAULT: v('fg'), 2: v('fg-2'), 3: v('fg-3'), 4: v('fg-4') },
        ink: { DEFAULT: v('ink'), 2: v('ink-2'), fg: v('ink-fg') },
        accent: v('accent'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 2px 8px -2px rgb(15 23 42 / 0.06)',
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.12)',
        float: '0 12px 40px -12px rgb(15 23 42 / 0.25), 0 2px 6px -2px rgb(15 23 42 / 0.1)',
        glow: '0 0 0 1px rgb(var(--indigo-500) / 0.25), 0 8px 24px -8px rgb(var(--indigo-500) / 0.35)',
      },
      borderRadius: {
        '2.5xl': '1.25rem',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '15%': { transform: 'rotate(-12deg)' },
          '30%': { transform: 'rotate(12deg)' },
          '45%': { transform: 'rotate(-8deg)' },
          '60%': { transform: 'rotate(8deg)' },
          '75%': { transform: 'rotate(-4deg)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateX(-50%) translateY(16px)' },
          to:   { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          to:   { opacity: '1', transform: 'none' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to:   { transform: 'none' },
        },
        'pop': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '60%': { transform: 'scale(1.03)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        wiggle:     'wiggle 1.2s ease-in-out infinite',
        'slide-up': 'slide-up 0.35s ease-out both',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both',
        'sheet-up': 'sheet-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        pop:        'pop 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}
