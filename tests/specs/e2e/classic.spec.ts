import { expect, test } from "../../fixtures/e2e";

test("Classic screen loads", async ({ classicPage }) => {
  await classicPage.goto();
  await expect(classicPage.heading).toBeVisible();
  await expect(classicPage.difficultyNavigation).toBeVisible();
});

test("Emoji game is marked in progress", async ({ emojiPage }) => {
  await emojiPage.goto();
  await expect(emojiPage.heading).toBeVisible();
  await expect(emojiPage.difficultyNavigation).toBeVisible();
});
