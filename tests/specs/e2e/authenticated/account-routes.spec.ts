import { env } from "../../../env";
import { expect, test } from "../../../fixtures/e2e";

test.beforeEach(async ({ loginPage, profilePage }) => {
  const { email, password } = env.normalTestCredentials;
  test.skip(!email || !password, "Production login credentials are not configured.");
  if (!email || !password) return;

  await loginPage.goto();
  await loginPage.signIn(email, password);
  await expect(profilePage.heading).toBeVisible();
});

test("authenticated user can access the issue report form", async ({ issueReportPage }) => {
  await issueReportPage.goto();

  await expect(issueReportPage.heading).toBeVisible();
  await expect(issueReportPage.gameSelect).toBeVisible();
  await expect(issueReportPage.titleInput).toBeVisible();
  await expect(issueReportPage.descriptionInput).toBeVisible();
  await expect(issueReportPage.submitButton).toBeVisible();
});

test("authenticated user can access the password reset page", async ({ resetPasswordPage }) => {
  await resetPasswordPage.goto();

  await expect(resetPasswordPage.heading).toBeVisible();
  await expect(resetPasswordPage.passwordInput).toBeVisible();
  await expect(resetPasswordPage.confirmPasswordInput).toBeVisible();
  await expect(resetPasswordPage.submitButton).toBeDisabled();
});

test("active users cannot access the account-disabled page", async ({
  accountDisabledPage,
  profilePage,
}) => {
  await accountDisabledPage.goto();

  await expect(profilePage.heading).toBeVisible();
});

test("account deletion confirmation requires the emailed single-use link", async ({
  deleteAccountPage,
  profilePage,
}) => {
  await deleteAccountPage.goto();

  await expect(profilePage.heading).toBeVisible();
});
