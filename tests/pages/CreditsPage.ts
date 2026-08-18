import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class CreditsPage extends BasePage {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: "Credits" });
  }

  async goto() {
    await super.goto("/credits");
  }
}