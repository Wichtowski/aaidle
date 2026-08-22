import { expect, test } from "../../fixtures/e2e";

test("robots.txt is served as a valid crawler policy", async ({ page }) => {
  const response = await page.request.get("/robots.txt");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(await response.text()).toBe("User-agent: *\nAllow: /\n");
});

test("Home page exposes both playable game modes", async ({ homePage }) => {
  await homePage.goto();

  await expect(homePage.heading).toBeVisible();
  await expect(homePage.playClassicLink).toBeVisible();
  await expect(homePage.playEmojiLink).toBeVisible();
});

test("Home page navigates to Classic", async ({ classicPage, homePage }) => {
  await homePage.goto();
  await homePage.playClassicLink.click();

  await expect(classicPage.heading).toBeVisible();
  await expect(classicPage.difficultyNavigation).toBeVisible();
});

test("Home page navigates to Emoji Clues", async ({ emojiPage, homePage }) => {
  await homePage.goto();
  await homePage.playEmojiLink.click();

  await expect(emojiPage.heading).toBeVisible();
  await expect(emojiPage.difficultyNavigation).toBeVisible();
});

test("Login page exposes password sign-in", async ({ loginPage }) => {
  await loginPage.goto();

  await expect(loginPage.heading).toBeVisible();
  await expect(loginPage.emailInput).toBeVisible();
  await expect(loginPage.passwordInput).toBeVisible();
  await expect(loginPage.signInButton).toBeVisible();
});

test("mobile navigation menu exposes site links", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile navigation is only shown on mobile");

  await page.goto("/");

  const menuButton = page.getByRole("button", { name: "Open navigation menu" });
  await expect(menuButton).toBeVisible();
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeHidden();

  await menuButton.click();

  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Credits", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
});

test("protected account routes redirect anonymous users to login", async ({
  accountDisabledPage,
  deleteAccountPage,
  loginPage,
  resetPasswordPage,
}) => {
  await resetPasswordPage.goto();
  await expect(loginPage.heading).toBeVisible();

  await deleteAccountPage.goto();
  await expect(loginPage.heading).toBeVisible();

  await accountDisabledPage.goto();
  await expect(loginPage.heading).toBeVisible();
});

test("Registration page exposes account fields", async ({ registerPage }) => {
  await registerPage.goto();

  await expect(registerPage.heading).toBeVisible();
  await expect(registerPage.emailInput).toBeVisible();
  await expect(registerPage.passwordInput).toBeVisible();
  await expect(registerPage.confirmPasswordInput).toBeVisible();
  await expect(registerPage.createAccountButton).toBeVisible();
});
