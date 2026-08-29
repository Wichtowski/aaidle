# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/e2e/authenticated/account-routes.spec.ts >> active users cannot access the account-disabled page
- Location: tests/specs/e2e/authenticated/account-routes.spec.ts:33:1

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
    - link "Profile":
      - /url: /profile
    - link "Privacy":
      - /url: /privacy/v1
    - link "Credits":
      - /url: /credits
    - link "Sign in":
      - /url: /login
    - link "Buy me a coffee":
      - /url: https://ko-fi.com/wichtowski
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
  - textbox "Email": ***
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
  4  | test.beforeEach(async ({ loginPage, profilePage }) => {
  5  |   const { email, password } = env.normalTestCredentials;
  6  |   test.skip(!email || !password, "Production login credentials are not configured.");
  7  |   if (!email || !password) return;
  8  | 
  9  |   await loginPage.goto();
  10 |   await loginPage.signIn(email, password);
> 11 |   await expect(profilePage.heading).toBeVisible();
     |                                     ^ Error: expect(locator).toBeVisible() failed
  12 | });
  13 | 
  14 | test("authenticated user can access the issue report form", async ({ issueReportPage }) => {
  15 |   await issueReportPage.goto();
  16 | 
  17 |   await expect(issueReportPage.heading).toBeVisible();
  18 |   await expect(issueReportPage.gameSelect).toBeVisible();
  19 |   await expect(issueReportPage.titleInput).toBeVisible();
  20 |   await expect(issueReportPage.descriptionInput).toBeVisible();
  21 |   await expect(issueReportPage.submitButton).toBeVisible();
  22 | });
  23 | 
  24 | test("authenticated user can access the password reset page", async ({ resetPasswordPage }) => {
  25 |   await resetPasswordPage.goto();
  26 | 
  27 |   await expect(resetPasswordPage.heading).toBeVisible();
  28 |   await expect(resetPasswordPage.passwordInput).toBeVisible();
  29 |   await expect(resetPasswordPage.confirmPasswordInput).toBeVisible();
  30 |   await expect(resetPasswordPage.submitButton).toBeDisabled();
  31 | });
  32 | 
  33 | test("active users cannot access the account-disabled page", async ({
  34 |   accountDisabledPage,
  35 |   profilePage,
  36 | }) => {
  37 |   await accountDisabledPage.goto();
  38 | 
  39 |   await expect(profilePage.heading).toBeVisible();
  40 | });
  41 | 
  42 | test("account deletion confirmation requires the emailed single-use link", async ({
  43 |   deleteAccountPage,
  44 |   profilePage,
  45 | }) => {
  46 |   await deleteAccountPage.goto();
  47 | 
  48 |   await expect(profilePage.heading).toBeVisible();
  49 | });
  50 | 
```