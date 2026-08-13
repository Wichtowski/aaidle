import { test, expect } from "@playwright/test";

const expectedVersion = process.env.PLAYWRIGHT_EXPECTED_VERSION;
const versionCheckIntervalMs = 30_000;
const versionCheckTimeoutMs = 10 * 60_000;

test.beforeEach(async ({ page }) => {
  if (!expectedVersion) {
    return;
  }

  test.setTimeout(versionCheckTimeoutMs);

  const deadline = Date.now() + versionCheckTimeoutMs;
  let actualVersion: string | null = null;

  await page.goto("/");

  while (Date.now() < deadline) {
    actualVersion = await page.locator("html").getAttribute("version");

    if (actualVersion === expectedVersion) {
      return;
    }

    await page.waitForTimeout(versionCheckIntervalMs);
    await page.reload();
  }

  expect(
    actualVersion,
    `Expected deployed version ${expectedVersion}, but found ${actualVersion ?? "no version attribute"}`,
  ).toBe(expectedVersion);
});

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
