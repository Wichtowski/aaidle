import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: "Keep your progress." });
  }

  get emailInput(): Locator {
    return this.page.getByLabel("Email");
  }

  get passwordInput(): Locator {
    return this.page.getByLabel("Password");
  }

  get signInButton(): Locator {
    return this.page.getByRole("button", { name: "Sign in" });
  }

  async goto() {
    await super.goto("/login");
  }

  async signIn(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }
}