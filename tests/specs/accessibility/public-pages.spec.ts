import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = ["/", "/classic", "/emoji", "/privacy", "/credits"];

test("public pages have no serious accessibility violations", async ({ page }) => {
  const reports = [];

  for (const route of routes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    reports.push({ route, violations: results.violations });
  }

  await mkdir("tests/reports/accessibility", { recursive: true });
  await writeFile(
    "tests/reports/accessibility/results.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2),
  );

  const seriousViolations = reports.flatMap(({ route, violations }) =>
    violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? "")).map((violation) => ({ route, id: violation.id })),
  );
  expect(seriousViolations).toEqual([]);
});
