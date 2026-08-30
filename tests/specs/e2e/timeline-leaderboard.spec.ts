import { expect, test } from "../../fixtures/e2e";

const historicalDate = "20260826";

test("global Timeline leaderboard exposes every ranking", async ({ timelineLeaderboardPage }) => {
  await timelineLeaderboardPage.gotoGlobal();

  await expect(timelineLeaderboardPage.heading).toHaveText("Global leaderboard.");
  await expect(timelineLeaderboardPage.globalRanking).toBeVisible();
  await expect(timelineLeaderboardPage.dailyLeaderboardLink).toBeVisible();

  for (const name of ["Fastest run", "Average time", "Completed"]) {
    const tab = timelineLeaderboardPage.rankingTabs.getByRole("tab", { name });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
});

test("dated Timeline leaderboard links back to global rankings", async ({
  page,
  timelineLeaderboardPage,
}) => {
  await timelineLeaderboardPage.gotoDaily(historicalDate);

  await expect(timelineLeaderboardPage.heading).toHaveText("Daily leaderboard.");
  await expect(page.getByText("Timeline Speedrun · 2026-08-26")).toBeVisible();
  await expect(timelineLeaderboardPage.dailyRanking).toBeVisible();

  await timelineLeaderboardPage.globalLeaderboardLink.click();
  await expect(page).toHaveURL(/\/timeline\/leaderboard$/);
  await expect(timelineLeaderboardPage.globalRanking).toBeVisible();
});
