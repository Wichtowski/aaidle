import { test, expect } from "@playwright/test";

test("Cookie consent requires an explicit choice", async ({ page }) => {
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "Cookies, with no escape hatch" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Essential only" }).click();
  await expect(dialog).toBeHidden();
});

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
