# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/e2e/authenticated/account-routes.spec.ts >> active users cannot access the account-disabled page
- Location: tests/specs/e2e/authenticated/account-routes.spec.ts:26:1

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
  7  | test.beforeEach(async ({ loginPage, profilePage }) => {
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
  17 | test("authenticated user can access the password reset page", async ({ resetPasswordPage }) => {
  18 |   await resetPasswordPage.goto();
  19 | 
  20 |   await expect(resetPasswordPage.heading).toBeVisible();
  21 |   await expect(resetPasswordPage.passwordInput).toBeVisible();
  22 |   await expect(resetPasswordPage.confirmPasswordInput).toBeVisible();
  23 |   await expect(resetPasswordPage.submitButton).toBeDisabled();
  24 | });
  25 | 
  26 | test("active users cannot access the account-disabled page", async ({
  27 |   accountDisabledPage,
  28 |   profilePage,
  29 | }) => {
  30 |   await accountDisabledPage.goto();
  31 | 
  32 |   await expect(profilePage.heading).toBeVisible();
  33 | });
  34 | 
  35 | test("account deletion confirmation requires the emailed single-use link", async ({
  36 |   deleteAccountPage,
  37 |   profilePage,
  38 | }) => {
  39 |   await deleteAccountPage.goto();
  40 | 
  41 |   await expect(profilePage.heading).toBeVisible();
  42 | });
  43 | 
```