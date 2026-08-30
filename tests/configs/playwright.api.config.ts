import { defineConfig, devices } from "@playwright/test";
import { env } from "../env";
import { cloudflareE2EHeaders } from "../http-headers";

export default defineConfig({
  testDir: "..",
  globalSetup: "../playwright-global-setup.ts",
  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? 1 : undefined,
  outputDir: "../results/api",
  reporter: env.isCI
    ? [["list"], ["allure-playwright", { resultsDir: "tests/reports/api-allure-results" }]]
    : [["list"]],
  use: {
    baseURL: env.baseURL,
    extraHTTPHeaders: cloudflareE2EHeaders(),
  },
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
