import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Club scorecard" print palette: paper & ink, gold for champions,
        // crimson for the lantern/down, moss for up. Nothing else.
        cream: "#F2EBDC", // paper
        ivory: "#EAE1CB", // wash
        card: "#F7F1E3", // barely-raised panel
        ink: "#221C13",
        sub: "#5D5443",
        faint: "#9A8F76",
        hairline: "#D6CAAE",
        forest: {
          DEFAULT: "#2F6B4F", // moss — positive / actions
          soft: "#3F8564",
          wash: "#E2EADB",
        },
        brass: {
          DEFAULT: "#8A6D1A", // gold ink — champions
          soft: "#C2A44E",
          wash: "#EFE6CC",
        },
        silverware: "#8B8778",
        bronzeware: "#93602F",
        brick: "#B3282D", // print crimson
        // Legacy accent slots — all resolved into the print palette.
        neon: {
          lime: "#221C13",
          coral: "#221C13",
          violet: "#221C13",
          pink: "#221C13",
          cyan: "#221C13",
          gold: "#8A6D1A",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(34, 28, 19, 0.06)",
        glow: "0 1px 2px rgba(34, 28, 19, 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
