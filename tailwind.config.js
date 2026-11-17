import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
// 색상은 src/styles.css 의 CSS 변수(--c-*)에서 관리합니다. 라이트/다크 모드가 같은 이름을 공유합니다.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 기존 화면의 zinc(회색) 클래스를 네이비 계열 slate 톤으로 통일
        zinc: colors.slate,
        surface: token('surface'),
        ink: token('ink'),
        accent: { DEFAULT: token('accent'), soft: token('accent-soft') },
        income: { DEFAULT: token('income'), soft: token('income-soft') },
        expense: { DEFAULT: token('expense'), soft: token('expense-soft') },
        gain: { DEFAULT: token('gain'), soft: token('gain-soft') },
        warn: token('warn')
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', '"Apple SD Gothic Neo"', '"Noto Sans KR"', '"Segoe UI"', 'sans-serif']
      }
    }
  },
  plugins: []
};
