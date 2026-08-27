import { defineConfig, devices } from "@playwright/test";
import { env } from "../env";

export default defineConfig({
  testDir: "..",
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? 1 : undefined,
  outputDir: "../results/lighthouse",
  reporter: [["list"], ["../env.ts"]],
  use: {
    baseURL: env.baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
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
      name: "lighthouse",
      dependencies: ["release-readiness"],
      testMatch: "specs/lighthouse/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
