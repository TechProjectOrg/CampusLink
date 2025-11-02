/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        // Adjusted breakpoints to ensure desktop layout on 14+ inch laptops
        // Default: sm: 640px, md: 768px, lg: 1024px, xl: 1280px
        // New: Lowered xl to 1200px to accommodate 14-inch laptops (typically 1366px width)
        'sm': '640px',   // Small devices
        'md': '768px',   // Tablets
        'lg': '1024px',  // Small laptops / large tablets
        'xl': '1200px',  // 14+ inch laptops (lowered from 1280px)
        '2xl': '1536px', // Large desktops
      },
    },
  },
  plugins: [],
}
