import { expect, test } from "../../fixtures/e2e";

test("Emoji screen loads", async ({ emojiPage }) => {
  await emojiPage.goto();
  await expect(emojiPage.heading).toBeVisible();
  await expect(emojiPage.difficultyNavigation).toBeVisible();
});

test("Emoji exposes clues and a guess control", async ({ emojiPage }) => {
  await emojiPage.goto();

  await expect(emojiPage.heading).toBeVisible();
  await expect(emojiPage.clues).toBeVisible();
  await expect(emojiPage.searchInput).toBeVisible();
  await expect(emojiPage.guessButton).toBeVisible();
});

test("Emoji accepts keyboard input", async ({ emojiPage }) => {
  await emojiPage.goto();

  await expect(emojiPage.searchInput).toBeVisible();
  await emojiPage.searchInput.click();
  await emojiPage.searchInput.pressSequentially("GPT");
  await expect(emojiPage.searchInput).toHaveValue("GPT");
  await expect(emojiPage.guessButton).toBeEnabled();
  await emojiPage.guessButton.click();
});
