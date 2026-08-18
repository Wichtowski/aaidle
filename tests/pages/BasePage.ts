import type { Locator, Page } from "@playwright/test";

export class BasePage {
  constructor(protected readonly page: Page) {}

  get documentRoot(): Locator {
    return this.page.locator("html");
  }

  get cookieConsentDialog(): Locator {
    return this.page.getByRole("dialog", { name: "Cookies? Cookies! Cookies..." });
  }

  async goto(path: string) {
    await this.page.goto(path);
  }
}