import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: ".wrangler/state/v3/d1/miniflare-D1DatabaseObject" },
});
