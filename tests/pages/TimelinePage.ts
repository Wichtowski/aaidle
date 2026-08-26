import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class TimelinePage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="game-heading"]');
  readonly difficultyNavigation: Locator = this.page.locator('[data-testid="timeline-difficulty"]');
  readonly submitButton: Locator = this.page.getByRole("button", {
    name: "Submit complete timeline",
  });

  async goto() {
    await super.goto("/timeline");
  }
}
