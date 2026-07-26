import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#12141c",
          raised: "#1a1d29",
          overlay: "#232738",
        },
        accent: {
          DEFAULT: "#8b5cf6",
          soft: "#a78bfa",
        },
      },
      fontFamily: {
        display: ["ui-rounded", "SF Pro Rounded", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
