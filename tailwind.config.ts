import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Members club after dark": the old-money token names now map to a
        // warm near-black base with neon accents, so components restyle wholesale.
        cream: "#131110", // page background
        ivory: "#221E1A", // raised surface / dark text on neon buttons
        card: "#1B1815",
        ink: "#F5F0E6", // primary text (warm white)
        sub: "#BFB6A6",
        faint: "#8A8172",
        hairline: "#322C25",
        forest: {
          DEFAULT: "#C6F23F", // primary action — neon lime
          soft: "#A8D62E",
          wash: "#232A12",
        },
        brass: {
          DEFAULT: "#F0C64B", // gold — champion & medals
          soft: "#C9A93F",
          wash: "#2B2413",
        },
        silverware: "#A3A5A8",
        bronzeware: "#C98D5A",
        brick: "#FF5C4D",
        neon: {
          lime: "#C6F23F", // steps
          coral: "#FF7A50", // workouts
          violet: "#B78CFF", // sleep
          pink: "#FF5D8F", // health
          cyan: "#3EE6C0", // calm / HRV
          gold: "#F0C64B", // composite
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px rgba(0, 0, 0, 0.25)",
        glow: "0 0 24px rgba(240, 198, 75, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
