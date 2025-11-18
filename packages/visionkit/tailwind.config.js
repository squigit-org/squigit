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
            gray: {
                800: '#1f2937',
                900: '#111827',
                950: '#030712',
            },
            black: {
                DEFAULT: '#000000',
                950: '#0a0a0a',
                900: '#121212',
            }
        },
        animation: {
            shimmer: 'shimmer 3s infinite',
        }
    },
  },
  plugins: [],
}