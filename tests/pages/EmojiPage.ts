import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class EmojiPage extends BasePage {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: "What AI idea do these clues point to?" });
  }

  get difficultyNavigation(): Locator {
    return this.page.getByRole("navigation", { name: "Emoji Clues difficulty" });
  }

  async goto() {
    await super.goto("/emoji");
  }
}