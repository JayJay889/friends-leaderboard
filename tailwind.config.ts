import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // SF-startup neutrals + one saturated accent per board (used on numbers
        // and washes, never as full panels).
        cream: "#FAFAF8", // page
        ivory: "#F3F3F0", // subtle wash
        card: "#FFFFFF",
        ink: "#1C1917",
        sub: "#57534E",
        faint: "#A8A29E",
        hairline: "#E7E5E1",
        forest: {
          DEFAULT: "#059669",
          soft: "#047857",
          wash: "#ECFDF5",
        },
        brass: {
          DEFAULT: "#D97706",
          soft: "#F59E0B",
          wash: "#FFFBEB",
        },
        silverware: "#A1A1AA",
        bronzeware: "#B45309",
        brick: "#E11D48",
        neon: {
          lime: "#059669", // steps
          coral: "#EA580C", // workouts
          violet: "#7C3AED", // sleep
          pink: "#E11D48", // health
          cyan: "#0891B2", // calm
          indigo: "#4F46E5", // club age
          gold: "#D97706", // composite
        },
        wash: {
          lime: "#ECFDF5",
          coral: "#FFF7ED",
          violet: "#F5F3FF",
          pink: "#FFF1F2",
          cyan: "#ECFEFF",
          indigo: "#EEF2FF",
          gold: "#FFFBEB",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(28, 25, 23, 0.04), 0 4px 12px rgba(28, 25, 23, 0.05)",
        glow: "0 1px 2px rgba(28, 25, 23, 0.04), 0 4px 12px rgba(28, 25, 23, 0.05)",
      },
    },
  },
  plugins: [],
} satisfies Config;
