/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        organic: {
          50: '#fdfbf7', // Warm off-white
          100: '#f7f3ec',
          200: '#efe6d8',
          300: '#e3d2b8',
          400: '#d4b693',
          500: '#c69a72',
          600: '#b88057',
          700: '#996646',
          800: '#7d533d',
          900: '#664535',
        },
        mist: {
          100: 'rgba(255, 255, 255, 0.4)',
          200: 'rgba(255, 255, 255, 0.6)',
          300: 'rgba(255, 255, 255, 0.8)',
        },
        soft: {
          purple: '#E0D4FC',
          pink: '#FCE4EC',
          cyan: '#E0F7FA',
          sage: '#E0F2F1',
        }
      },
      borderRadius: {
        'blob': '40% 60% 70% 30% / 40% 50% 60% 50%',
        'blob-hover': '60% 40% 30% 70% / 50% 40% 50% 60%',
        'organic-lg': '24px 16px 32px 20px',
        'organic-md': '18px 12px 20px 14px',
      },
      animation: {
        'blob-morph': 'morph 8s ease-in-out infinite',
        'breathe': 'breathe 6s ease-in-out infinite',
        'float': 'float 10s ease-in-out infinite',
      },
      keyframes: {
        morph: {
          '0%, 100%': { borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%' },
          '34%': { borderRadius: '70% 30% 50% 50% / 30% 30% 70% 70%' },
          '67%': { borderRadius: '100% 60% 60% 100% / 100% 100% 60% 60%' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      },
      boxShadow: {
        'soft-lg': '0 20px 40px -10px rgba(0,0,0,0.05)',
        'soft-md': '0 10px 20px -5px rgba(0,0,0,0.03)',
        'inner-light': 'inset 0 2px 4px 0 rgba(255, 255, 255, 0.5)',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
