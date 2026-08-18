import { expect } from "@playwright/test";
import { playAudit } from "playwright-lighthouse";
import { env } from "../../env";
import { lighthouseTest as test } from "../../fixtures/lighthouse";

const performanceThreshold = Number(process.env.LIGHTHOUSE_PERFORMANCE_THRESHOLD ?? 70);

test("homepage meets the Lighthouse performance threshold", async ({ lighthousePage, port }) => {
  await lighthousePage.goto("/");
  await lighthousePage.waitForLoadState("networkidle");

  const report = await playAudit({
    page: lighthousePage,
    port,
    thresholds: { performance: performanceThreshold },
    opts: { disableStorageReset: true },
    config: {
      extends: "lighthouse:default",
      settings: {
        onlyCategories: ["performance"],
      },
    },
    reports: {
      formats: { html: true, json: true },
      name: "homepage",
      directory: "tests/reports/performance",
    },
  });

  expect(report.lhr.finalUrl).toBe(new URL("/", env.baseURL).toString());
});
