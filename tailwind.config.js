/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#1845E8', // Signature Controlphone Royal Blue
          600: '#163ecf',
          700: '#1232a8',
          800: '#102781',
          900: '#0f2268',
        },
        sidebar: {
          DEFAULT: '#0B0F17',
          card: '#131926',
          hover: '#1B2234',
          border: '#1F2937'
        },
        surface: {
          DEFAULT: '#F4F6FA',
          card: '#FFFFFF',
          border: '#E5E7EB',
          subtle: '#F8FAFC'
        },
        // Medalhas do pódio (ouro, prata, bronze)
        rank: {
          1: '#F5A524',
          2: '#94A3B8',
          3: '#C8742E',
        },
        tenant: {
          primary: 'var(--tenant-primary)',
          secondary: 'var(--tenant-secondary)',
          accent: 'var(--tenant-accent)',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 8px -1px rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.02)',
        'card-hover': '0 8px 24px -4px rgba(24, 69, 232, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
        'blue-glow': '0 8px 25px -4px rgba(24, 69, 232, 0.35)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      }
    },
  },
  plugins: [],
}
