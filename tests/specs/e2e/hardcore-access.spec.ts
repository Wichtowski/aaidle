import { env } from "../../env";
import { expect, test } from "../../fixtures/e2e";

test("Hardcore account can open the Hardcore game", async ({ loginPage, page }) => {
  const { email, password } = env.hardcoreTestCredentials;
  test.skip(!email || !password, "Production Hardcore credentials are not configured.");
  if (!email || !password) return;

  await loginPage.goto();
  await loginPage.signIn(email, password);

  await page.goto("/classic/hardcore");

  await expect(page.getByTestId("game-heading")).toBeVisible();
  await expect(page.getByText("Nothing answers.")).toBeHidden();
});
