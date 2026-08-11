import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://aaidle.com";
const runInCI = process.env.CI === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: runInCI,
  retries: runInCI ? 2 : 0,
  workers: runInCI ? 1 : undefined,
  outputDir: "tests/results",
  reporter: runInCI
    ? [
        ["blob", { outputDir: "tests/reports/blob" }],
        ["allure-playwright", { resultsDir: "tests/reports/allure-results" }],
      ]
    : [["list"], ["html", { open: "never", outputFolder: "tests/reports/playwright" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
