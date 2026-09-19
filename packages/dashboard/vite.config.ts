import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

/** The deployed URLs live in .env.local, written by scripts/outputs.mjs. */
function envValue(key: string, fallback = ""): string {
  for (const f of ["../../.env.local", "../../.env"]) {
    try {
      for (const line of readFileSync(new URL(f, import.meta.url), "utf8").split("\n")) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (m && m[1] === key) return m[2]!.trim().replace(/^["']|["']$/g, "");
      }
    } catch { /* not present yet */ }
  }
  return fallback;
}

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_API_BASE": JSON.stringify(envValue("GX_API_BASE")),
    "import.meta.env.VITE_SITE_ID": JSON.stringify(envValue("GX_SITE_ID", "site_corrick")),
    "import.meta.env.VITE_CDN_URL": JSON.stringify(envValue("GX_CDN_URL")),
    "import.meta.env.VITE_SITE_A_URL": JSON.stringify(envValue("GX_SITE_A_URL")),
  },
  build: { outDir: "dist", emptyOutDir: true },
});
