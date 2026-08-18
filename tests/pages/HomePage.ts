import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class HomePage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="home-heading"]');
  readonly playClassicLink: Locator = this.page.locator('[data-testid="home-play-classic"]');
  readonly playEmojiLink: Locator = this.page.locator('[data-testid="home-play-emoji"]');

  async goto() {
    await super.goto("/");
  }

  async chooseEssentialCookies() {
    await this.essentialCookiesButton.click();
  }
}