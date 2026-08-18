import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class ClassicPage extends BasePage {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: "Guess today’s AI model" });
  }

  get guessButton(): Locator {
    return this.page.getByRole("button", { name: "Guess" });
  }

  async goto() {
    await super.goto("/classic");
  }
}