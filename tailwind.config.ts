import type { Config } from "tailwindcss";

// "Campus After Dark" palette: dark navy + turquoise, with a warm amber accent.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          950: "#06141f",
          900: "#0a1c2a",
          800: "#0f2738",
          700: "#143247",
          600: "#1b4059",
          500: "#25526f",
        },
        teal: {
          300: "#7af3e8",
          400: "#3fe3d4",
          500: "#1fcfc0",
          600: "#14a99c",
        },
        amber: {
          300: "#ffe08a",
          400: "#f8c94a",
          500: "#eab530",
        },
        danger: { 400: "#ff6b6b", 500: "#f04848" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(63,227,212,.25), 0 8px 30px -10px rgba(63,227,212,.35)",
      },
    },
  },
  plugins: [],
};
export default config;
