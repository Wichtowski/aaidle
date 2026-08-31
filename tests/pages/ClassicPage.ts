import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class ClassicPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="game-heading"]');
  readonly difficultyNavigation: Locator = this.page.locator(
    '[data-testid="classic-difficulty"]',
  );
  readonly closeRulesButton: Locator = this.page.getByRole("button", {
    name: "Close Classic rules",
  });
  readonly searchInput: Locator = this.page.getByRole("combobox", { name: "Choose a model" });
  readonly guessButton: Locator = this.page.locator('[data-testid="classic-guess-submit"]');

  async goto() {
    await super.goto("/classic");
    await this.heading.waitFor({ state: "visible" });
    await this.closeRulesButton
      .waitFor({ state: "visible", timeout: 2_000 })
      .catch(() => undefined);
    if (await this.closeRulesButton.isVisible()) {
      await this.closeRulesButton.click();
    }
  }
}
