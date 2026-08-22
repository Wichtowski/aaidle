# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/e2e/public-pages.spec.ts >> protected account routes redirect anonymous users to login
- Location: tests/specs/e2e/public-pages.spec.ts:44:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid="login-heading"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-testid="login-heading"]')

```

```yaml
- main:
  - img "Icon for aaidle.com"
  - heading "aaidle.com" [level=1]
  - heading "Performing security verification" [level=2]
  - paragraph: This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.
- contentinfo:
  - text: "Ray ID:"
  - code: a2f4260dbe00478e
  - text: Performance and Security by
  - link "Cloudflare, opens in a new tab":
    - /url: https://www.cloudflare.com?utm_source=challenge&utm_campaign=m
    - text: Cloudflare
  - link "Privacy, opens in a new tab":
    - /url: https://www.cloudflare.com/privacypolicy/
    - text: Privacy
```

# Test source

```ts
  1  | import { expect, test } from "../../fixtures/e2e";
  2  | 
  3  | test("robots.txt is served as a valid crawler policy", async ({ page }) => {
  4  |   const response = await page.request.get("/robots.txt");
  5  | 
  6  |   expect(response.ok()).toBe(true);
  7  |   expect(response.headers()["content-type"]).toContain("text/plain");
  8  |   expect(await response.text()).toBe("User-agent: *\nAllow: /\n");
  9  | });
  10 | 
  11 | test("Home page exposes both playable game modes", async ({ homePage }) => {
  12 |   await homePage.goto();
  13 | 
  14 |   await expect(homePage.heading).toBeVisible();
  15 |   await expect(homePage.playClassicLink).toBeVisible();
  16 |   await expect(homePage.playEmojiLink).toBeVisible();
  17 | });
  18 | 
  19 | test("Home page navigates to Classic", async ({ classicPage, homePage }) => {
  20 |   await homePage.goto();
  21 |   await homePage.playClassicLink.click();
  22 | 
  23 |   await expect(classicPage.heading).toBeVisible();
  24 |   await expect(classicPage.difficultyNavigation).toBeVisible();
  25 | });
  26 | 
  27 | test("Home page navigates to Emoji Clues", async ({ emojiPage, homePage }) => {
  28 |   await homePage.goto();
  29 |   await homePage.playEmojiLink.click();
  30 | 
  31 |   await expect(emojiPage.heading).toBeVisible();
  32 |   await expect(emojiPage.difficultyNavigation).toBeVisible();
  33 | });
  34 | 
  35 | test("Login page exposes password sign-in", async ({ loginPage }) => {
  36 |   await loginPage.goto();
  37 | 
  38 |   await expect(loginPage.heading).toBeVisible();
  39 |   await expect(loginPage.emailInput).toBeVisible();
  40 |   await expect(loginPage.passwordInput).toBeVisible();
  41 |   await expect(loginPage.signInButton).toBeVisible();
  42 | });
  43 | 
  44 | test("protected account routes redirect anonymous users to login", async ({
  45 |   accountDisabledPage,
  46 |   deleteAccountPage,
  47 |   loginPage,
  48 |   resetPasswordPage,
  49 | }) => {
  50 |   await resetPasswordPage.goto();
  51 |   await expect(loginPage.heading).toBeVisible();
  52 | 
  53 |   await deleteAccountPage.goto();
> 54 |   await expect(loginPage.heading).toBeVisible();
     |                                   ^ Error: expect(locator).toBeVisible() failed
  55 | 
  56 |   await accountDisabledPage.goto();
  57 |   await expect(loginPage.heading).toBeVisible();
  58 | });
  59 | 
  60 | test("Registration page exposes account fields", async ({ registerPage }) => {
  61 |   await registerPage.goto();
  62 | 
  63 |   await expect(registerPage.heading).toBeVisible();
  64 |   await expect(registerPage.emailInput).toBeVisible();
  65 |   await expect(registerPage.passwordInput).toBeVisible();
  66 |   await expect(registerPage.confirmPasswordInput).toBeVisible();
  67 |   await expect(registerPage.createAccountButton).toBeVisible();
  68 | });
  69 | 
```