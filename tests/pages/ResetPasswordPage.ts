import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class ResetPasswordPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="reset-password-heading"]');
  readonly passwordInput: Locator = this.page.locator('[data-testid="reset-password"]');
  readonly confirmPasswordInput: Locator = this.page.locator(
    '[data-testid="reset-confirm-password"]',
  );
  readonly submitButton: Locator = this.page.locator('[data-testid="reset-submit"]');

  async goto() {
    await super.goto("/reset-password");
  }
}
