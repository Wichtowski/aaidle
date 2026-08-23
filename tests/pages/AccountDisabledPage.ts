import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class AccountDisabledPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="account-disabled-heading"]');
  readonly reason: Locator = this.page.locator('[data-testid="account-disabled-reason"]');

  async goto() {
    await super.goto("/account-disabled");
  }
}
