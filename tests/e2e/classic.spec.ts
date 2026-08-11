import { test, expect } from "@playwright/test";
test("Classic screen loads", async ({ page }) => {
  await page.goto("/classic");
  await expect(page.getByRole("heading", { name: "Guess today’s AI model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guess" })).toBeVisible();
});

test("Emoji game is marked in progress", async ({ page }) => {
  await page.goto("/emoji");
  await expect(page.getByRole("heading", { name: "Emoji is on its way." })).toBeVisible();
  await expect(page.getByText("In progress")).toBeVisible();
});
