/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./source/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        colors: {
            neutral: {
                100: 'var(--neutral-100)',
                150: 'var(--neutral-150)',
                200: 'var(--neutral-200)',
                300: 'var(--neutral-300)',
                400: 'var(--neutral-400)',
                500: 'var(--neutral-500)',
                550: 'var(--neutral-550)',
                800: 'var(--neutral-800)',
                850: 'var(--neutral-850)',
                '800-60': 'rgba(51, 51, 51, 0.6)',
                900: 'var(--neutral-900)',
                '900-70': 'rgba(26, 26, 26, 0.7)',
                950: 'var(--neutral-950)',
                '800-80': 'rgba(51, 51, 51, 0.8)',
                '900-80': 'rgba(26, 26, 26, 0.8)',
                '950-95': 'rgba(10, 10, 10, 0.95)'
            },
            black: {
                '500-30': 'var(--black-500-30)',
                '500-60': 'var(--black-500-60)',
                '500-20': 'var(--black-500-20)',
            },
            red: {
                200: 'var(--red-200)',
                '900-50': 'var(--red-900-50)',
                '500-60': 'var(--red-500-60)',
            },
            brand: {
                primary: 'var(--brand-primary)',

            },
            effects: {
                glow: 'var(--glow)',
                overlay: 'var(--overlay)',
            },
            lens: {
                svg: 'var(--lens-svg-color)',
                hover: 'var(--lens-hover-bg)',
                'border-c1': 'var(--lens-border-c1)',
                'border-c2': 'var(--lens-border-c2)',
                'border-c3': 'var(--lens-border-c3)',
            }
        },
        animation: {
            shimmer: 'shimmer 3s infinite',
        }
    },
  },
  plugins: [],
}