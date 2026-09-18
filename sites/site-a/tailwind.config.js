/**
 * Site A — "Corrick". PLAN.md §5.2.
 * Palette and type are fixed here so P2 cannot drift into default-Tailwind look.
 * Site A and Site B must read as two different companies.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./public/**/*.html"],
  theme: {
    extend: {
      colors: {
        paper: "#FBF8F3",
        ink: "#1B1A17",
        muted: "#6E675C",
        hairline: "#E6DFD4",
        terracotta: "#B04A22",
        sage: "#5C6B5A",
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Karla"', "system-ui", "sans-serif"],
      },
      borderRadius: { DEFAULT: "6px" },
      maxWidth: { measure: "62ch" },
    },
  },
  plugins: [],
};
