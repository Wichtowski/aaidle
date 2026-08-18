import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class ProfilePage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="profile-heading"]');

  async goto() {
    await super.goto("/profile");
  }
}