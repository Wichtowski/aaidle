import { expect, test } from "../../fixtures/e2e";

test("Privacy page loads", async ({ privacyPage }) => {
  await privacyPage.goto();
  await expect(privacyPage.heading).toBeVisible();
});

test("Credits page loads", async ({ creditsPage }) => {
  await creditsPage.goto();
  await expect(creditsPage.heading).toBeVisible();
});

test("Issue report form is available without submitting an issue", async ({ issueReportPage }) => {
  await issueReportPage.goto();
  await expect(issueReportPage.heading).toBeVisible();
  await expect(issueReportPage.titleInput).toBeVisible();
  await expect(issueReportPage.descriptionInput).toBeVisible();
  await expect(issueReportPage.submitButton).toBeVisible();
});

test("Profile page loads", async ({ profilePage }) => {
  await profilePage.goto();
  await expect(profilePage.heading).toBeVisible();
});
