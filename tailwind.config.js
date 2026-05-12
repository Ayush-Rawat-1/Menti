/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50:  '#FDFBF7',
          100: '#FAF7F0',
          200: '#F4EDE0',
        },
        forest: {
          400: '#52936E',
          500: '#3D7A5A',
          600: '#2D6347',
          700: '#1E4D35',
          800: '#163829',
        },
        bark: {
          100: '#EDE0D4',
          200: '#D9C4AE',
          300: '#B89880',
          400: '#8C6E5A',
          500: '#5C4033',
        },
        stone: {
          850: '#1C1917',
          900: '#0F0D0C',
        },
      },
      fontFamily: {
        serif:  ['"Lora"', 'Georgia', 'serif'],
        sans:   ['"DM Sans"', 'sans-serif'],
      },
      boxShadow: {
        soft:   '0 2px 16px rgba(0,0,0,0.06)',
        'soft-lg': '0 8px 40px rgba(0,0,0,0.10)',
      },
      animation: {
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.35s ease-out',
        'pulse-dot':  'pulseDot 1.2s ease-in-out infinite',
        'shimmer':    'shimmer 1.6s linear infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:  { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: '0.3', transform: 'scale(0.8)' }, '50%': { opacity: '1', transform: 'scale(1.2)' } },
        shimmer:  { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
}
