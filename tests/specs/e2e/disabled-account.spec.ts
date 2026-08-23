import { env } from "../../env";
import { expect, test } from "../../fixtures/e2e";

// Never publish browser artifacts from the test that receives a production password
test.use({ trace: "off", screenshot: "off", video: "off" });

test("disabled user receives a restricted session with the disable reason", async ({
  accountDisabledPage,
  loginPage,
  page,
}) => {
  const { email, password } = env.deactivatedTestCredentials;
  test.skip(!email || !password, "Production deactivated-account credentials are not configured.");
  if (!email || !password) return;

  await loginPage.goto();
  await loginPage.signIn(email, password);

  await expect(page).toHaveURL(/\/account-disabled$/);
  await expect(accountDisabledPage.heading).toBeVisible();
  await expect(accountDisabledPage.reason).toContainText(
    "Production E2E disabled-account fixture",
  );
  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible();
});
