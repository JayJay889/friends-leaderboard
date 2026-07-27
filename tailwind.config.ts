import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Old-money palette: cream paper, ivory cards, warm ink, forest & brass.
        cream: "#F5F0E6",
        ivory: "#FBF8F1",
        card: "#FFFDF8",
        ink: "#2A2520",
        sub: "#6F675A",
        faint: "#9C937F",
        hairline: "#E5DECD",
        forest: {
          DEFAULT: "#1F4D3A",
          soft: "#2E6B51",
          wash: "#EDF2EC",
        },
        brass: {
          DEFAULT: "#A9852F",
          soft: "#C7A968",
          wash: "#F6EEDC",
        },
        silverware: "#8E8E88",
        bronzeware: "#9C6B4A",
        brick: "#A94438",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(42, 37, 32, 0.05), 0 8px 24px rgba(42, 37, 32, 0.05)",
      },
    },
  },
  plugins: [],
} satisfies Config;
