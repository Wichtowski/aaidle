import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
      "@app": fileURLToPath(new URL("../../src/app", import.meta.url)),
      "@components": fileURLToPath(new URL("../../src/app/components", import.meta.url)),
      "@lib": fileURLToPath(new URL("../../src/lib", import.meta.url)),
      "@data": fileURLToPath(new URL("../../data", import.meta.url)),
    },
  },
  test: {
    include: ["tests/specs/unit/**/*.test.{ts,tsx}"],
    exclude: ["tests/specs/unit/timeline-seed.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    reporters: ["default", "json"],
    outputFile: { json: "tests/reports/vitest.json" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "tests/reports/frontend-coverage",
    },
  },
});
