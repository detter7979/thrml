import type { Config } from "tailwindcss"

const config: Config = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF5F0",
          100: "#FFE8DC",
          500: "#C75B3A",
          600: "#B04E30",
          900: "#1A1410",
        },
        warm: {
          50: "#F7F3EE",
          100: "#EDE8E2",
          200: "#DDD4C8",
          400: "#A89580",
          600: "#7A6355",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        serif: ["DM Serif Display", "serif"],
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "24px",
      },
    },
  },
}

export default config
