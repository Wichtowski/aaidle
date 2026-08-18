import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class RegisterPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="register-heading"]');
  readonly emailInput: Locator = this.page.locator('[data-testid="auth-email"]');
  readonly passwordInput: Locator = this.page.locator('[data-testid="auth-password"]');
  readonly confirmPasswordInput: Locator = this.page.locator(
    '[data-testid="register-confirm-password"]',
  );
  readonly createAccountButton: Locator = this.page.locator('[data-testid="auth-submit"]');

  async goto() {
    await super.goto("/register");
  }
}
