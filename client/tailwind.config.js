/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coach: {
          dark: '#0f172a',
          primary: '#38bdf8',
          accent: '#818cf8'
        }
      }
    },
  },
  plugins: [],
}
