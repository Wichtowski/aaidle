import { BasePage } from "./BasePage";

export class HomePage extends BasePage {
  async goto() {
    await super.goto("/");
  }

  async chooseEssentialCookies() {
    await this.cookieConsentDialog.getByRole("button", { name: "Essential only" }).click();
  }
}