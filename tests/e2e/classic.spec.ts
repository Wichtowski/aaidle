import { test, expect } from "@playwright/test";
test("Classic screen loads", async ({ page }) => {
  await page.goto("/classic");
  await expect(page.getByRole("heading", { name: "Guess today’s AI model" })).toBeVisible();
});
