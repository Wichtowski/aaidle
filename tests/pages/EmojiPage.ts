import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class EmojiPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="game-heading"]');
  readonly difficultyNavigation: Locator = this.page.locator('[data-testid="emoji-difficulty"]');
  readonly clues: Locator = this.page.locator('[aria-label="Visual clues"]');
  readonly searchInput: Locator = this.page.getByRole("combobox", { name: "Name the answer" });
  readonly guessButton: Locator = this.page.getByRole("button", { name: "Guess", exact: true });

  async goto() {
    await super.goto("/emoji");
  }
}
