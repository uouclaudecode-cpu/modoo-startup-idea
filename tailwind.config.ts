import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 서비스 대표색: 신뢰감 있는 파랑
        brand: {
          50: "#eef4ff",
          100: "#dbe7ff",
          200: "#bfd3ff",
          300: "#93b4fd",
          400: "#6090fa",
          500: "#3b6cf6",
          600: "#2552e8",
          700: "#1d41cc",
          800: "#1e37a5",
          900: "#1e3383",
        },
        ink: {
          DEFAULT: "#0f172a",
          soft: "#334155",
          muted: "#64748b",
          faint: "#94a3b8",
        },
        line: "#e2e8f0",
        canvas: "#f6f8fb",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "Apple SD Gothic Neo",
          "Malgun Gothic",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "24px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px rgb(15 23 42 / 0.06)",
        lift: "0 12px 32px rgb(15 23 42 / 0.14)",
      },
      keyframes: {
        "toast-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // 스켈레톤 반짝임 (왼쪽 → 오른쪽)
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // 화면을 옮길 때 새 화면이 살짝 떠오르며 나타나기
        "page-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // 위쪽 진행 막대 끝의 반짝임
        "progress-glow": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        "toast-in": "toast-in 0.18s ease-out",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        // backwards: 끝난 뒤에는 transform이 남지 않아야 화면 안의 fixed(창·전체 화면 안내)가 제자리에 있어요
        "page-in": "page-in 0.28s ease-out backwards",
        "progress-glow": "progress-glow 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
