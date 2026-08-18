import { expect, test } from "../../fixtures/e2e";
import { env } from "../../env";

// Never publish browser artifacts from the test that receives a production password.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("Password login reaches the profile", async ({ loginPage, profilePage }) => {
  const { email, password } = env.testCredentials;
  test.skip(!email || !password, "Production login credentials are not configured.");
  if (!email || !password) return;

  await loginPage.goto();
  await expect(loginPage.heading).toBeVisible();
  await loginPage.signIn(email, password);
  await expect(profilePage.heading).toBeVisible();
});