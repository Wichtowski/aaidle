import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://aaidle.com";
const runInCI = process.env.CI === "true";
const e2eBypassToken = process.env.PLAYWRIGHT_E2E_BYPASS_TOKEN;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: runInCI,
  retries: runInCI ? 2 : 0,
  workers: runInCI ? 1 : undefined,
  reporter: runInCI ? [["blob"], ["allure-playwright"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    extraHTTPHeaders: {
      "X-Aidle-E2E": "true",
      ...(e2eBypassToken ? { "X-Aidle-E2E-Token": e2eBypassToken } : {}),
    },
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
