import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // WHOOP-derived system (from their brand guidelines):
        // near-black gradient surfaces, blue-gray text, teal for positive/CTA,
        // one metric color per pillar, valuation bands for recovery-style scores.
        cream: "#101518", // page base (gradient top #283339 set in globals)
        ivory: "#1B2328", // raised wash
        card: "#161C20",
        ink: "#FFFFFF",
        sub: "#9FB0BA",
        faint: "#5E6E78",
        hairline: "#232D33",
        forest: {
          DEFAULT: "#16EC06", // valuation up (WHOOP high-recovery green)
          soft: "#12C405",
          wash: "#0F2613",
        },
        brass: {
          DEFAULT: "#00F19F", // teal — CTAs, highlights, champions
          soft: "#00C583",
          wash: "#0A2A22",
        },
        lagoon: {
          DEFAULT: "#4FD8E8", // crystal-water blue — pre-flight instructions
          soft: "#2CBFD1",
          wash: "#0D262B",
        },
        silverware: "#6E7E88",
        bronzeware: "#8A6B52",
        brick: "#FF0026", // valuation down / red lantern
        metric: {
          strain: "#0093E7",
          sleep: "#7BA1BB",
          recovery: "#67AEE6",
          health: "#00F19F",
          age: "#9FB0BA",
          gold: "#00F19F",
        },
        band: {
          high: "#16EC06",
          mid: "#FFDE00",
          low: "#FF0026",
        },
      },
      fontFamily: {
        display: ["var(--font-words)", "system-ui", "sans-serif"], // Proxima Nova stand-in
        num: ["var(--font-num)", "system-ui", "sans-serif"], // DINPro stand-in
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.4)",
        glow: "0 1px 2px rgba(0, 0, 0, 0.4)",
      },
    },
  },
  plugins: [],
} satisfies Config;
