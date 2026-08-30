import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class TimelineLeaderboardPage extends BasePage {
  readonly dailyLeaderboardLink: Locator = this.page.getByRole("link", {
    name: "Today’s leaderboard",
  });
  readonly dailyRanking: Locator = this.page.getByRole("region", {
    name: "Speedrun leaderboard",
  });
  readonly globalLeaderboardLink: Locator = this.page.getByRole("link", {
    name: "Global leaderboard",
  });
  readonly globalRanking: Locator = this.page.getByRole("region", {
    name: "Speedrun rankings",
  });
  readonly heading: Locator = this.page.getByRole("heading", { level: 1 });
  readonly rankingTabs: Locator = this.page.getByRole("tablist", { name: "Global ranking" });

  async gotoDaily(date: string) {
    await super.goto(`/timeline/leaderboard/${date}`);
  }

  async gotoGlobal() {
    await super.goto("/timeline/leaderboard");
  }
}
