import { defineConfig, devices } from "@playwright/test";
import { env } from "../env";
import { cloudflareE2EHeaders } from "../http-headers";
import { consentState } from "../state/consent-state";

export default defineConfig({
  testDir: "..",
  globalSetup: "../playwright-global-setup.ts",
  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? 1 : undefined,
  outputDir: "../results/e2e",
  reporter: env.isCI
    ? [["list"], ["blob", { outputDir: "../reports/blob" }]]
    : [["list"], ["html", { open: "never", outputFolder: "../reports/playwright" }]],
  use: {
    baseURL: env.baseURL,
    extraHTTPHeaders: cloudflareE2EHeaders(),
    serviceWorkers: "block",
    trace: "on",
    screenshot: "on",
    video: "on",
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
      use: {
        ...devices["Desktop Chrome"],
        storageState: consentState(env.baseURL),
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    },
    {
      name: "firefox",
      dependencies: ["release-readiness"],
      testMatch: "specs/e2e/**/*.spec.ts",
      use: { ...devices["Desktop Firefox"], storageState: consentState(env.baseURL) },
    },
    {
      name: "mobile-chromium",
      dependencies: ["release-readiness"],
      testMatch: "specs/e2e/**/*.spec.ts",
      use: { ...devices["Pixel 5"], storageState: consentState(env.baseURL) },
    },
  ],
});
