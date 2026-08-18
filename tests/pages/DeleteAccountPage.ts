import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class DeleteAccountPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="delete-account-heading"]');
  readonly cancelButton: Locator = this.page.locator('[data-testid="delete-account-cancel"]');
  readonly confirmButton: Locator = this.page.locator('[data-testid="delete-account-confirm"]');

  async goto() {
    await super.goto("/delete-account");
  }
}
