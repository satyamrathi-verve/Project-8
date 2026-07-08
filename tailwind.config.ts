import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#2f6bff",
          dark: "#1f4ed8",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        float: "0 8px 30px rgba(16,24,40,0.10)",
        glow: "0 0 0 1px rgba(47,107,255,0.25), 0 8px 24px rgba(47,107,255,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
