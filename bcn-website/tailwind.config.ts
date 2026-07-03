import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16201A",
        pine: "#1E3A2E",
        moss: "#6D7B55",
        sage: "#E7ECDE",
        parchment: "#F6F2E7",
        rust: "#BB6A2E",
        stone: "#7C8574"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Arial", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"]
      },
      boxShadow: {
        soft: "0 18px 60px rgba(22, 32, 26, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
