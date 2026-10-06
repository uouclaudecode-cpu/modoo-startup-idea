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
      },
      animation: {
        "toast-in": "toast-in 0.18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
