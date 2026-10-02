import { expect, test, type Page } from "@playwright/test";

async function dismissDialogs(page: Page) {
  const consent = page.getByRole("button", { name: /reject|necessary only|essential only/i });
  if (await consent.count()) await consent.first().click();
  const rules = page.getByRole("button", { name: "Got it", exact: true });
  if (await rules.count()) await rules.click();
}

test("Classic selects one hint and restores it after a reload", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("aaidle:how-to-play:v1", JSON.stringify({ "classic:llm:normal": true })),
  );
  const id = "2c8d3858-8e24-4ad0-b1d3-7d231af19a58";
  let guessed = false;
  let revealed = false;
  const model = {
    id: "wrong",
    name: "Example model",
    providerName: "Test",
    familyName: null,
    aliases: [],
  };
  const guessedModel = {
    id: "wrong",
    name: "Example model",
    provider: "Test",
    country: "US",
    family: [],
    categories: [],
    inputModalities: [],
    outputModalities: [],
    useCases: [],
    categoryDetails: {},
    reasoningSupport: "unknown",
    weightAvailability: null,
    releaseYear: 2024,
    releaseDate: "2024-01-01",
    contextWindowTokens: null,
  };
  const guess = {
    guessedModel,
    comparison: { provider: "incorrect", release: "higher" },
    isCorrect: false,
    attemptNumber: 1,
    matchingFamily: [],
    matchingCategories: [],
    matchingInputModalities: [],
    matchingOutputModalities: [],
    matchingUseCases: [],
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/classic/llm/normal"))
      await route.fulfill({
        json: {
          challenge: {
            id,
            date: "2026-09-30",
            mode: "classic:llm:normal",
            difficulty: "normal",
            expiresAt: "2099-10-01T00:00:00Z",
          },
          columns: ["provider", "release"],
          models: [model],
          globalCompletionCount: 0,
        },
      });
    else if (path.endsWith("/hints")) {
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON()).toEqual({ column: "provider" });
        revealed = true;
      }
      await route.fulfill({
        json: {
          hints: revealed ? [{ column: "provider", value: "OpenAI" }] : [],
          availableColumns: revealed ? ["release"] : ["provider", "release"],
          remainingHints: guessed && !revealed ? 1 : 0,
        },
      });
    } else if (path.endsWith("/guesses")) {
      if (route.request().method() === "POST") {
        guessed = true;
        await route.fulfill({ json: { ...guess, globalCompletionCount: 0 } });
      } else
        await route.fulfill({
          json: {
            guesses: guessed
              ? [
                  {
                    ...guess,
                    requestId: "2ad7aefe-9a37-41cb-b0cd-43d068c0a1eb",
                    attemptedAt: Date.now(),
                  },
                ]
              : [],
          },
        });
    } else await route.fulfill({ json: { user: null } });
  });
  await page.goto("/classic/llm");
  await dismissDialogs(page);
  await page.getByRole("combobox").fill("Example");
  await page.getByRole("button", { name: /Example model/ }).click();
  const hints = page.getByRole("region", { name: "Classic hints" });
  await expect(hints.getByRole("button", { name: "Provider", exact: true })).toBeVisible();
  await expect(hints.getByText("OpenAI", { exact: true })).toHaveCount(0);
  await hints.getByRole("button", { name: "Provider", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(hints).toContainText("Provider: OpenAI");
  await page.reload();
  await expect(hints).toContainText("Provider: OpenAI");
  await expect(hints.getByRole("button", { name: "Provider", exact: true })).toHaveCount(0);
});

test("Timeline unlocks a chosen Auto-place after three misses and locks it across reloads", async ({
  page,
}) => {
  const id = "bde0eb89-eb16-42d4-ae80-1713ebeb30ee";
  let misses = 0;
  let placed = false;
  const order = ["old", "b", "a", "new"];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/timeline/normal"))
      await route.fulfill({
        json: {
          challenge: {
            id,
            date: "2026-09-30",
            difficulty: "normal",
            expiresAt: "2099-10-01T00:00:00Z",
          },
          slots: [
            {
              position: 0,
              anchor: {
                id: "old",
                name: "Old anchor",
                itemKind: "model",
                releaseDate: "2019-01-01",
              },
            },
            { position: 1, anchor: null },
            { position: 2, anchor: null },
            {
              position: 3,
              anchor: {
                id: "new",
                name: "New anchor",
                itemKind: "model",
                releaseDate: "2024-01-01",
              },
            },
          ],
          movableModels: [
            { id: "a", name: "Model A", itemKind: "model" },
            { id: "b", name: "Model B", itemKind: "model" },
          ],
          progress: {
            solved: false,
            attemptLimit: null,
            attemptsRemaining: null,
            latestAttempt: misses
              ? { modelOrder: order, placements: [1, 0, 0, 1], attemptNumber: misses }
              : null,
          },
        },
      });
    else if (path.endsWith("/attempts")) {
      misses += 1;
      await route.fulfill({
        json: { placements: [1, 0, 0, 1], attemptsRemaining: null, revealedModels: [] },
      });
    } else if (path.endsWith("/auto-place")) {
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON()).toEqual({ cardId: "a" });
        placed = true;
      }
      await route.fulfill({
        json: {
          autoPlacements: placed ? [{ cardId: "a", position: 1 }] : [],
          incorrectSubmissions: misses,
          unlockEvery: 3,
          remainingAutoPlacements: misses >= 3 && !placed ? 1 : 0,
          availableCardIds: placed ? ["b"] : ["b", "a"],
        },
      });
    } else await route.fulfill({ json: { user: null } });
  });
  await page.goto("/timeline");
  await dismissDialogs(page);
  await page.getByRole("button", { name: /Model B/ }).press("Enter");
  await page.getByRole("button", { name: /Empty timeline position 2/ }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Position 2: Model B", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Model A/ }).press("Enter");
  await page.getByRole("button", { name: /Empty timeline position 3/ }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Position 3: Model A", exact: true }),
  ).toBeVisible();
  for (let i = 1; i <= 3; i += 1) {
    await page.getByRole("button", { name: "Submit complete timeline" }).click();
    await expect(page.getByRole("button", { name: "Submit complete timeline" })).toBeEnabled();
    if (i < 3)
      await expect(page.getByRole("button", { name: "Auto-place Model A" })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Auto-place Model A" }).click();
  const fixed = page.getByRole("button", {
    name: "Position 2: Model A, auto-placed and locked",
    exact: true,
  });
  // The displaced card landed on a slot it has not been judged on yet
  const displaced = page.getByRole("button", { name: "Position 3: Model B", exact: true });
  await expect(fixed).toBeVisible();
  await expect(displaced).toBeVisible();
  await fixed.focus();
  await page.keyboard.press("ArrowRight");
  await expect(fixed).toBeVisible();
  await page.reload();
  await expect(fixed).toBeVisible();
  await expect(displaced).toBeVisible();
  await expect(page.getByText("1 card automatically placed and locked.")).toBeVisible();
});
