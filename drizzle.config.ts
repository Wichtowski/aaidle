import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./lib/db/schema.ts",
  dialect: "sqlite",
  out: "./database/drizzle",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "data/aidle.db" },
});
