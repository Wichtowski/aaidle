import { expect, test } from "../../fixtures/e2e";

test("Privacy page loads", async ({ privacyPage }) => {
  await privacyPage.goto();
  await expect(privacyPage.heading).toBeVisible();
});

test("Credits page loads", async ({ creditsPage }) => {
  await creditsPage.goto();
  await expect(creditsPage.heading).toBeVisible();
});

test("Profile page loads", async ({ profilePage }) => {
  await profilePage.goto();
  await expect(profilePage.heading).toBeVisible();
});
