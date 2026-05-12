/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.90)',
          hover:   'rgba(255,255,255,1)',
          active:  'rgba(37,99,235,0.08)',
        },
        border: {
          DEFAULT: 'rgba(37,99,235,0.12)',
          accent:  'rgba(37,99,235,0.30)',
        },
        dark: {
          900: '#f1f5f9',
          800: '#e8f0fe',
          700: '#dbeafe',
          600: '#bfdbfe',
        },
      },
      backgroundImage: {
        'gradient-radial':  'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':   'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'glass-gradient':   'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.80) 100%)',
        'indigo-gradient':  'linear-gradient(135deg, #2563eb, #6366f1)',
        'purple-gradient':  'linear-gradient(135deg, #6366f1, #8b5cf6)',
        'cyan-gradient':    'linear-gradient(135deg, #06b6d4, #2563eb)',
        'success-gradient': 'linear-gradient(135deg, #10b981, #06b6d4)',
        'danger-gradient':  'linear-gradient(135deg, #ef4444, #f97316)',
        'warn-gradient':    'linear-gradient(135deg, #f59e0b, #ef4444)',
      },
      boxShadow: {
        'glass':    '0 8px 32px rgba(37,99,235,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
        'card-3d':  '0 20px 60px rgba(37,99,235,0.10), 0 0 30px rgba(37,99,235,0.05)',
        'glow-sm':  '0 0 10px rgba(37,99,235,0.20)',
        'glow-md':  '0 0 20px rgba(37,99,235,0.28)',
        'glow-lg':  '0 0 40px rgba(37,99,235,0.35)',
        'glow-xl':  '0 0 80px rgba(37,99,235,0.25)',
        'sidebar':  '4px 0 40px rgba(37,99,235,0.08)',
        'header':   '0 4px 30px rgba(37,99,235,0.08)',
        'btn':      '0 4px 15px rgba(37,99,235,0.25)',
        'btn-hover':'0 8px 30px rgba(37,99,235,0.40)',
      },
      animation: {
        'fadeInUp':    'fadeInUp 0.55s cubic-bezier(.22,.68,0,1.2) both',
        'fadeInLeft':  'fadeInLeft 0.45s cubic-bezier(.22,.68,0,1.2) both',
        'scaleIn':     'scaleIn 0.4s cubic-bezier(.22,.68,0,1.2) both',
        'float':       'float 7s ease-in-out infinite',
        'pulseGlow':   'pulseGlow 2.5s ease-in-out infinite',
        'spinSlow':    'spinSlow 10s linear infinite',
        'borderGlow':  'borderGlow 3s ease-in-out infinite',
        'shimmer':     'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(24px) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fadeInLeft: {
          from: { opacity: '0', transform: 'translateX(-20px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.88)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0) rotate(0deg)' },
          '33%':     { transform: 'translateY(-14px) rotate(1.5deg)' },
          '66%':     { transform: 'translateY(8px) rotate(-1deg)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 15px rgba(37,99,235,0.20)' },
          '50%':     { boxShadow: '0 0 40px rgba(37,99,235,0.45)' },
        },
        spinSlow: {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        borderGlow: {
          '0%,100%': { borderColor: 'rgba(37,99,235,0.15)' },
          '50%':     { borderColor: 'rgba(37,99,235,0.40)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition:  '200% center' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(.22,.68,0,1.2)',
      },
    },
  },
  plugins: [],
};
