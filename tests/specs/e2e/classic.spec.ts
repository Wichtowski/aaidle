import { expect, test } from "../../fixtures/e2e";

test("Classic screen loads", async ({ classicPage }) => {
  await classicPage.goto();
  await expect(classicPage.heading).toBeVisible();
  await expect(classicPage.difficultyNavigation).toBeVisible();
});

test("Classic exposes Normal and Challenge difficulties", async ({ classicPage, page }) => {
  await classicPage.goto();

  await expect(page.getByRole("button", { name: "Normal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Challenge" })).toBeVisible();
});

test("Classic exposes its category navigation", async ({ classicPage, page }) => {
  await classicPage.goto();

  await expect(page.getByRole("navigation", { name: "Classic category" })).toBeVisible();
  await expect(page.getByRole("link", { name: "LLM", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "CV", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Filters", exact: true })).toBeVisible();
});

test("Classic accepts keyboard input", async ({ classicPage }) => {
  await classicPage.goto();

  await expect(classicPage.searchInput).toBeVisible();
  await classicPage.searchInput.click();
  await classicPage.searchInput.pressSequentially("GPT");
  await expect(classicPage.searchInput).toHaveValue("GPT");
  await expect(classicPage.guessButton).toBeEnabled();
  await classicPage.guessButton.click();
});
