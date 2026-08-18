import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class EmojiPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="game-heading"]');
  readonly difficultyNavigation: Locator = this.page.locator('[data-testid="emoji-difficulty"]');

  async goto() {
    await super.goto("/emoji");
  }
}