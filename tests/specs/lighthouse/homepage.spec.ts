import { expect } from "@playwright/test";
import { playAudit } from "playwright-lighthouse";
import { env } from "../../env";
import { lighthouseTest as test } from "../../fixtures/lighthouse";
import { cloudflareE2EHeaders } from "../../http-headers";

const lighthouseThresholds = Object.fromEntries(
  Object.entries(env.reporting.lighthouse).map(([category, threshold]) => [
    category === "bestPractices" ? "best-practices" : category,
    threshold,
  ]),
);

test("homepage meets the Lighthouse performance threshold", async ({ lighthousePage, port }) => {
  await lighthousePage.goto("/");
  await lighthousePage.waitForLoadState("networkidle");

  const report = await playAudit({
    page: lighthousePage,
    port,
    thresholds: lighthouseThresholds,
    opts: {
      disableStorageReset: true,
      extraHeaders: cloudflareE2EHeaders(),
    },
    reports: {
      formats: { html: true, json: true },
      name: "homepage",
      directory: "tests/reports/lighthouse",
    },
  });

  expect(report.lhr.finalUrl).toBe(new URL("/", env.baseURL).toString());
});
