import { defineConfig } from "drizzle-kit";
import { readFileSync } from "node:fs";

// drizzle-kit runs outside the app, so it loads .env itself.
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]!]) {
    process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
  }
}

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // strict:true would prompt for confirmation, which hangs a non-interactive run.
  strict: false,
  verbose: true,
});
