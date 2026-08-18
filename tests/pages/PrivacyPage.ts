import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class PrivacyPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="privacy-heading"]');

  async goto() {
    await super.goto("/privacy/v1");
  }
}