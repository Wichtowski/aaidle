import { defineConfig, devices } from "@playwright/test";
import { env } from "../env";
import { consentState } from "../state/consent-state";

export default defineConfig({
  testDir: "..",
  forbidOnly: env.isCI,
  retries: 0,
  workers: 1,
  outputDir: "../results/accessibility",
  reporter: [["list"], ["../env.ts"]],
  use: {
    baseURL: env.baseURL,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    storageState: consentState(env.baseURL),
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
      name: "accessibility",
      dependencies: ["release-readiness"],
      testMatch: "specs/accessibility/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
