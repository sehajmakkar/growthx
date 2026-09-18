/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // `extend` is not used for colour: the default palette is removed entirely
    // so a stray `bg-blue-500` cannot compile. PLAN.md §5.1 — default Tailwind
    // blue is the fastest way to look machine-generated.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      base: "var(--base)",
      surface: "var(--surface)",
      ink: "var(--ink)",
      muted: "var(--muted)",
      border: "var(--border)",
      accent: "var(--accent)",
      "accent-soft": "var(--accent-soft)",
      positive: "var(--positive)",
      negative: "var(--negative)",
      caution: "var(--caution)",
      pending: "var(--pending)",
    },
    extend: {
      fontFamily: {
        display: ['"Archivo"', "system-ui", "sans-serif"],
        sans: ['"Public Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: { DEFAULT: "var(--radius-control)", card: "var(--radius-card)" },
      boxShadow: { card: "var(--shadow-card)" },
      maxWidth: { measure: "68ch" },
    },
  },
  plugins: [],
};
