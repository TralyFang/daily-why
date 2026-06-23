import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f7ff",
          100: "#e0effe",
          200: "#bae0fd",
          300: "#7cc8fb",
          400: "#36aaf6",
          500: "#0c8ce9",
          600: "#006bc1",
          700: "#005099",
          800: "#003d76",
          900: "#002b54",
        },
        warm: {
          50: "#fef9f0",
          100: "#fdf0d5",
          200: "#fce0a8",
          300: "#f9c96e",
          400: "#f5a623",
          500: "#e88d0c",
          600: "#c76e08",
          700: "#9d5306",
          800: "#7a3e05",
          900: "#5a2b04",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans SC",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
