import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0C1F3F',
          50: '#E8ECF4',
          100: '#C6D0E4',
          200: '#9DAFC9',
          300: '#738FAF',
          400: '#4D729A',
          500: '#2A5685',
          600: '#1A3D6B',
          700: '#0C1F3F',
          800: '#081629',
          900: '#040D18',
        },
        teal: {
          DEFAULT: '#0D9E8A',
          50: '#E6F7F5',
          100: '#BEEAE4',
          200: '#93DBD2',
          300: '#64CBBF',
          400: '#3DBDAE',
          500: '#0D9E8A',
          600: '#0A8474',
          700: '#07695C',
          800: '#044F45',
          900: '#02352E',
        },
        gold: {
          DEFAULT: '#F5A623',
          50: '#FEF5E4',
          100: '#FDE5B9',
          200: '#FBD48A',
          300: '#F9C35B',
          400: '#F7B43A',
          500: '#F5A623',
          600: '#D48B12',
          700: '#A86E0E',
          800: '#7C510A',
          900: '#503507',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
