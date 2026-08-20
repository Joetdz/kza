/** @type {import('tailwindcss').Config} */
// Push notification banner animations added
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
      },
      animation: {
        wiggle:    'wiggle 1.2s ease-in-out infinite',
        'slide-up': 'slide-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
}
