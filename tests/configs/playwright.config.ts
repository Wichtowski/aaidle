import { defineConfig, devices } from "@playwright/test";
import { env } from "../env";
import { consentState } from "../state/consent-state";

export default defineConfig({
  testDir: "..",
  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? 1 : undefined,
  outputDir: "../results/e2e",
  reporter: env.isCI
    ? [
        ["blob", { outputDir: "tests/reports/blob" }],
        ["allure-playwright", { resultsDir: "tests/reports/allure-results" }],
        ["../env.ts"],
      ]
    : [
        ["list"],
        ["html", { open: "never", outputFolder: "tests/reports/playwright" }],
        ["../env.ts"],
      ],
  use: {
    baseURL: env.baseURL,
    extraHTTPHeaders: env.cloudflareE2EToken
      ? { "x-aaidle-cf-e2e-token": env.cloudflareE2EToken }
      : undefined,
    trace: env.cloudflareE2EToken ? "off" : "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
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
      name: "chromium",
      dependencies: ["release-readiness"],
      testMatch: "specs/e2e/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], storageState: consentState(env.baseURL) },
    },
    {
      name: "mobile-chromium",
      dependencies: ["release-readiness"],
      testMatch: "specs/e2e/**/*.spec.ts",
      use: { ...devices["Pixel 5"], storageState: consentState(env.baseURL) },
    },
  ],
});
