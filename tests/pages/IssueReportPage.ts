import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class IssueReportPage extends BasePage {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: "Report an issue." });
  }

  get titleInput(): Locator {
    return this.page.getByLabel("Short title");
  }

  get descriptionInput(): Locator {
    return this.page.getByLabel("What happened?");
  }

  get submitButton(): Locator {
    return this.page.getByRole("button", { name: "Send report" });
  }

  async goto() {
    await super.goto("/report-issue");
  }
}