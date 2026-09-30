import { expect, test } from "@playwright/test";
import { mockGames } from "../../state/game-api-state";
import type { DailyCompletionSummary } from "../../../src/lib/validation/daily-completion";

test("the last required daily game opens a spoiler-free summary, copies and never repeats after refresh", async ({
  page,
  context,
}) => {
  const { complete } = await mockGames(page, false);
  const result = (id: string, label: string) => ({
    id,
    label,
    completed: true,
    result: "3",
    modifiers: [],
  });
  await page.route("**/api/v1/games/daily-completion/**", async (route) => {
    const solved = complete.size > 0;
    const llm = { ...result("classic-llm", "LLM"), completed: solved, result: solved ? "1" : "—" };
    const summary: DailyCompletionSummary = {
      challengeDate: "2026-09-30",
      sequenceNumber: null,
      requirementVersion: 1,
      groups: [
        {
          ...result("classic", "Classic"),
          completed: solved,
          result: "1 / 3 / 3 / 3 / 3 / 3",
          results: [
            llm,
            result("classic-cv", "CV"),
            result("classic-nlp", "NLP"),
            result("classic-od", "Object Detection"),
            result("classic-classical-ml", "Classical ML"),
            result("classic-filters", "Filters"),
          ],
        },
        { ...result("emoji", "Emoji"), results: [result("emoji", "Emoji")] },
        {
          ...result("timeline", "Timeline"),
          result: "2",
          results: [{ ...result("timeline", "Timeline"), result: "2" }],
        },
      ],
      highestCompletedTier: solved ? "normal" : null,
      allRequiredGamesComplete: solved,
      hardcoreSweep: false,
      highestCelebratedTier: null,
      goatSeen: false,
    };
    await route.fulfill({ json: summary });
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/classic/llm");
  await expect(page.getByRole("dialog", { name: /daily set complete/i })).toHaveCount(0);
  await page.getByRole("combobox").fill("Example");
  await page.getByRole("button", { name: /Example model/ }).click();
  await page.getByRole("button", { name: "Close completion dialog" }).click();
  const dialog = page.getByRole("dialog", { name: /normal daily set complete/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Classic");
  await expect(dialog).toContainText("Emoji");
  await expect(dialog).toContainText("Timeline");
  await expect(dialog).not.toContainText("Logo");
  await dialog.getByRole("button", { name: "Copy results" }).click();
  await expect(dialog.getByRole("status")).toContainText("Daily results copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("I completed all #aAIdle modes for 2026-09-30 🏅");
  expect(copied).toContain("🤖 LLM: 1");
  expect(copied).toContain("🕰️ Timeline: 2");
  expect(copied).not.toMatch(/Example|example|2024|answerModel|00000000/);
  await dialog.getByRole("button", { name: "Close daily summary" }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("aaidle:progress:v1")!).dailyCompletion.milestones[
          "2026-09-30:1"
        ].highestCelebratedTier,
    ),
  ).toBe("normal");
  await page.reload();
  await expect(page.getByRole("button", { name: "Daily summary" })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Daily summary" }).click();
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "/tmp/aaidle-daily-summary-mobile.png" });
});
