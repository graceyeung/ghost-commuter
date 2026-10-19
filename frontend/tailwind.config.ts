import type { Config } from "tailwindcss";

// Colours are CSS variables (RGB channels) defined in app/globals.css so the dark default and the
// light theme share one set of semantic names.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        border: token("border"),
        ink: token("ink"),
        muted: token("muted"),
        amber: token("amber"),
        "on-amber": token("on-amber"),
        "amber-text": token("amber-text"),
        danger: token("danger"),
        success: token("success"),
        info: token("info"),
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--amber) / 0.25), 0 10px 40px -10px rgb(var(--amber) / 0.35)",
        card: "0 1px 0 0 rgb(var(--ink) / 0.04) inset, 0 20px 40px -24px rgb(0 0 0 / 0.45)",
      },
      maxWidth: { prose: "65ch" },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: { flicker: "flicker 2.4s ease-in-out infinite" },
    },
  },
  plugins: [],
};

export default config;
