import type { Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class IssueReportPage extends BasePage {
  readonly heading: Locator = this.page.locator('[data-testid="issue-report-heading"]');
  readonly titleInput: Locator = this.page.locator('[data-testid="issue-report-title"]');
  readonly descriptionInput: Locator = this.page.locator(
    '[data-testid="issue-report-description"]',
  );
  readonly submitButton: Locator = this.page.locator('[data-testid="issue-report-submit"]');

  async goto() {
    await super.goto("/report-issue");
  }
}