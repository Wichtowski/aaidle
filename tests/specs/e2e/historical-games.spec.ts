import { expect, test } from "@playwright/test";
import { mockGames } from "../../state/game-api-state";

test("authenticated day arrows preserve routes, browser history and date boundaries", async ({
  page,
}) => {
  await mockGames(page);
  await page.goto("/classic/llm");
  await expect(page.getByRole("link", { name: "Previous daily game" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next daily game" })).toHaveCount(0);
  await page.getByRole("link", { name: "Previous daily game" }).click();
  await expect(page).toHaveURL(/\/classic\/llm\/20260929$/);
  await expect(page.locator(".game-date-navigation")).toContainText("2026-09-29 · History");
  await page.getByRole("link", { name: "Previous daily game" }).click();
  await expect(page).toHaveURL(/20260928$/);
  await page.goBack();
  await expect(page).toHaveURL(/20260929$/);
  await page.goForward();
  await expect(page).toHaveURL(/20260928$/);
  await page.getByRole("link", { name: "Next daily game" }).click();
  await page.getByRole("link", { name: "Next daily game" }).click();
  await expect(page).toHaveURL(/\/classic\/llm$/);
  await page.goto("/classic/cv/20260811");
  await expect(page.locator(".game-date-navigation")).toContainText("2026-08-11 · History");
  await expect(page.getByRole("link", { name: "Previous daily game" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Next daily game" })).toBeVisible();
  await page.goto("/classic/llm/20260930");
  await expect(page).toHaveURL(/\/classic\/llm$/);
});

test("history arrows keep the category's own route segment", async ({ page }) => {
  await mockGames(page);
  // Object Detection is the category whose route segment differs from its key
  await page.goto("/classic/od");
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await page.getByRole("link", { name: "Previous daily game" }).click();
  await expect(page).toHaveURL(/\/classic\/od\/20260929$/);
  await page.reload();
  await expect(page).toHaveURL(/\/classic\/od\/20260929$/);
  await expect(page.locator(".game-date-navigation")).toContainText("2026-09-29 · History");
  await page.getByRole("link", { name: "Next daily game" }).click();
  await expect(page).toHaveURL(/\/classic\/od$/);
});

for (const path of ["/classic/llm", "/timeline", "/emoji", "/logo"]) {
  test(`${path} historical games support direct links and reloads`, async ({ page }) => {
    await mockGames(page);
    await page.goto(`${path}/20260820`);
    await expect(page.locator(".game-date-navigation")).toContainText("2026-08-20 · History");
    await expect(page.getByRole("link", { name: "Next daily game" })).toBeVisible();
    await page.reload();
    await expect(page.locator(".game-date-navigation")).toContainText("2026-08-20 · History");
  });
}

test("guests cannot enter dated games or see history navigation", async ({ page }) => {
  const { requests } = await mockGames(page, false);
  await page.goto("/classic/llm/20260820");
  await expect(page).toHaveURL(/\/login$/);
  expect(requests.some((path) => path.endsWith("/20260820"))).toBe(false);
  await page.goto("/classic/llm");
  await expect(page.getByRole("combobox")).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous daily game" })).toHaveCount(0);
});

test("malformed and out-of-range days never fall back to today's game", async ({ page }) => {
  const { requests } = await mockGames(page);
  for (const date of ["abc", "20260230", "20260810", "20990101"]) {
    await page.goto(`/classic/llm/${date}`);
    await expect(page.getByText("Daily game unavailable", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0);
  }
  expect(requests.some((path) => path === "/games/classic/llm/normal")).toBe(false);
});

test("historical Classic completion restores on reload without securing today", async ({
  page,
}) => {
  await mockGames(page);
  await page.goto("/classic/llm/20260820");
  await page.getByRole("combobox").fill("Example");
  await page.getByRole("button", { name: /Example model/ }).click();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.locator(".game-streak")).toContainText("0 day Classic streak");
  await page.reload();
  await expect(page.getByRole("button", { name: "Show winning guess" })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.locator(".game-date-navigation")).toContainText("2026-08-20 · History");
  await expect(page.locator(".game-streak")).toContainText("Play any Classic mode today");
});
