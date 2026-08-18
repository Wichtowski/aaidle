import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class PrivacyPage extends BasePage {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: "The necessary corporate stuff." });
  }

  async goto() {
    await super.goto("/privacy/v1");
  }
}