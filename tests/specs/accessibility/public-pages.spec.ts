import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { env } from "../../env";

const routes = ["/", "/classic", "/emoji", "/privacy", "/credits"];
const cloudflareChallengeRoutes = new Set(["/classic", "/emoji", "/privacy", "/credits"]);
const ignoredBrandColorContrastTargets = new Set([
  ".hero > .eyebrow",
  ".game-modes__heading > .eyebrow",
  '.game-mode-card[href$="classic"][data-discover="true"] > span',
  'a[data-testid="home-play-emoji"] > span',
  ".game-mode-card--in-progress > span",
  "article > span",
  'a[data-testid="home-play-timeline"] > span',
  ".game-intro__meta > .eyebrow",
  ".game-help__button > span",
]);

test("public pages have no serious accessibility violations", async ({ page }) => {
  const reports = [];

  for (const route of routes) {
    await page.goto(route);
    const axe = new AxeBuilder({ page });

    if (cloudflareChallengeRoutes.has(route)) {
      // Cloudflare Bot Fight Mode injects this third-party challenge frame.
      // Excluding it keeps the audit focused on application-owned markup.
      axe.exclude('iframe[src*="/cdn-cgi/challenge-platform/"]');
    }

    const results = await axe.analyze();
    const violations = results.violations
      .map((violation) =>
        violation.id !== "color-contrast"
          ? violation
          : {
              ...violation,
              nodes: violation.nodes.filter(
                ({ target }) =>
                  !target.some(
                    (selector) =>
                      typeof selector === "string" &&
                      ignoredBrandColorContrastTargets.has(selector),
                  ),
              ),
            },
      )
      .filter(({ nodes }) => nodes.length > 0);
    reports.push({ route, violations });
  }

  await mkdir("tests/reports/accessibility", { recursive: true });
  await writeFile(
    "tests/reports/accessibility/results.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2),
  );

  const seriousViolations = reports.flatMap(({ route, violations }) =>
    violations
      .filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))
      .map((violation) => ({ route, id: violation.id })),
  );
  expect(seriousViolations.length).toBeLessThanOrEqual(
    env.reporting.accessibility.maximumViolations,
  );
});
