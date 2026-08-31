import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="login-heading"]');
  readonly emailInput: Locator = this.page.locator('[data-testid="auth-email"]');
  readonly passwordInput: Locator = this.page.locator('[data-testid="auth-password"]');
  readonly signInButton: Locator = this.page.locator('[data-testid="auth-submit"]');

  async goto() {
    await super.goto("/login");
  }

  async signIn(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
    await this.page.waitForLoadState("networkidle");
    await this.page.waitForURL(/\/(?:profile|account-disabled)$/);
  }
}