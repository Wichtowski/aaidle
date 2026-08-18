import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class CreditsPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="credits-heading"]');

  async goto() {
    await super.goto("/credits");
  }
}