import type { Locator, Page } from "@playwright/test";

export class BasePage {
  constructor(protected readonly page: Page) {}

  readonly documentRoot: Locator = this.page.locator("html");
  readonly cookieConsentDialog: Locator = this.page.locator(
    '[data-testid="cookie-consent-dialog"]',
  );
  readonly essentialCookiesButton: Locator = this.page.locator(
    '[data-testid="cookie-consent-essential"]',
  );

  async goto(path: string) {
    await this.page.goto(path);
  }
}