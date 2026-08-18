import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class ClassicPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="game-heading"]');
  readonly difficultyNavigation: Locator = this.page.locator(
    '[data-testid="classic-difficulty"]',
  );
  readonly guessButton: Locator = this.page.locator('[data-testid="classic-guess-submit"]');

  async goto() {
    await super.goto("/classic");
  }
}