import { expect, test } from "../../fixtures/e2e";
import { env } from "../../env";

test("Password login reaches the profile", async ({ loginPage, profilePage }) => {
  const { email, password } = env.normalTestCredentials;
  test.skip(!email || !password, "Production login credentials are not configured.");
  if (!email || !password) return;

  await loginPage.goto();
  await expect(loginPage.heading).toBeVisible();
  await loginPage.signIn(email, password);
  await expect(profilePage.heading).toBeVisible();
});
