import { expect, test } from "../../fixtures/e2e";

// Override the normal projects' pre-accepted consent state for this first-visit test.
test.use({ storageState: { cookies: [], origins: [] } });

test("Cookie consent requires an explicit choice", async ({ homePage, page }) => {
  await homePage.goto();

  await expect(homePage.cookieConsentDialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(homePage.cookieConsentDialog).toBeVisible();

  await page.mouse.click(5, 5);
  await expect(homePage.cookieConsentDialog).toBeVisible();

  await homePage.chooseEssentialCookies();
  await expect(homePage.cookieConsentDialog).toBeHidden();
});