import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class ProfilePage extends BasePage {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: "Profile" });
  }

  async goto() {
    await super.goto("/profile");
  }
}