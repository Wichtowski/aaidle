# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/e2e/authenticated/account-routes.spec.ts >> authenticated user can access the issue report form
- Location: tests/specs/e2e/authenticated/account-routes.spec.ts:17:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid="profile-heading"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-testid="profile-heading"]')

```

```yaml
- main:
  - navigation "Main navigation":
    - link "aAIdle home":
      - /url: /
      - text: aAIdle
    - button "Open navigation menu"
  - paragraph: Your aAIdle account
  - heading "Keep your progress." [level=1]
  - paragraph: Create your aAIdle profile for account features and future game modes.
  - alert:
    - text: We could not complete that request.
    - button "Dismiss notification"
  - link "Continue with GitHub":
    - /url: /api/v1/auth/oauth/github
  - link "Continue with Google":
    - /url: /api/v1/auth/oauth/google
  - text: or use your email Email
  - textbox "Email": qa.normal@aaidle.com
  - text: Password
  - textbox "Password Show password": ***
  - button "Show password"
  - button "Sign in"
  - button "Forgot password?"
  - link "Need an account? Create one":
    - /url: /register
```

# Test source

```ts
  1  | import { env } from "../../../env";
  2  | import { expect, test } from "../../../fixtures/e2e";
  3  | 
  4  | // Never publish browser artifacts from tests that receive a production password.
  5  | test.use({ trace: "off", screenshot: "off", video: "off" });
  6  | 
  7  | test.beforeEach(async ({ issueReportPage, loginPage, profilePage }) => {
  8  |   const { email, password } = env.normalTestCredentials;
  9  |   test.skip(!email || !password, "Production login credentials are not configured.");
  10 |   if (!email || !password) return;
  11 | 
  12 |   await loginPage.goto();
  13 |   await loginPage.signIn(email, password);
> 14 |   await expect(profilePage.heading).toBeVisible();
     |                                     ^ Error: expect(locator).toBeVisible() failed
  15 | });
  16 | 
  17 | test("authenticated user can access the issue report form", async ({ issueReportPage }) => {
  18 |   await issueReportPage.goto();
  19 | 
  20 |   await expect(issueReportPage.heading).toBeVisible();
  21 |   await expect(issueReportPage.gameSelect).toBeVisible();
  22 |   await expect(issueReportPage.titleInput).toBeVisible();
  23 |   await expect(issueReportPage.descriptionInput).toBeVisible();
  24 |   await expect(issueReportPage.submitButton).toBeVisible();
  25 | });
  26 | 
  27 | test("authenticated user can access the password reset page", async ({ resetPasswordPage }) => {
  28 |   await resetPasswordPage.goto();
  29 | 
  30 |   await expect(resetPasswordPage.heading).toBeVisible();
  31 |   await expect(resetPasswordPage.passwordInput).toBeVisible();
  32 |   await expect(resetPasswordPage.confirmPasswordInput).toBeVisible();
  33 |   await expect(resetPasswordPage.submitButton).toBeDisabled();
  34 | });
  35 | 
  36 | test("active users cannot access the account-disabled page", async ({
  37 |   accountDisabledPage,
  38 |   profilePage,
  39 | }) => {
  40 |   await accountDisabledPage.goto();
  41 | 
  42 |   await expect(profilePage.heading).toBeVisible();
  43 | });
  44 | 
  45 | test("account deletion confirmation requires the emailed single-use link", async ({
  46 |   deleteAccountPage,
  47 |   profilePage,
  48 | }) => {
  49 |   await deleteAccountPage.goto();
  50 | 
  51 |   await expect(profilePage.heading).toBeVisible();
  52 | });
  53 | 
```