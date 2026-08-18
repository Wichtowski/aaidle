import { defineConfig, devices } from "@playwright/test";
import { env } from "../env";

export default defineConfig({
  testDir: "..",
  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? 1 : undefined,
  outputDir: "tests/results/api",
  reporter: [["list"]],
  use: { baseURL: env.baseURL },
  projects: [
    {
      name: "release-readiness",
      testMatch: "setups/e2e/**/*.setup.ts",
      retries: 0,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "production-api",
      dependencies: ["release-readiness"],
      testMatch: "specs/api/**/*.spec.ts",
    },
  ],
});
