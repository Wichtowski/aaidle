import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class AccountDisabledPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="account-disabled-heading"]');

  async goto() {
    await super.goto("/account-disabled");
  }
}
