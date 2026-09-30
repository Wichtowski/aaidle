import { expect, test } from "@playwright/test";

test("guest family streaks refresh after a win and survive browser reload", async ({ page }) => {
  const id = "2c8d3858-8e24-4ad0-b1d3-7d231af19a58";
  let completed = false;
  const model = {
    id: "example",
    name: "Example model",
    providerName: "Test",
    familyName: null,
    aliases: [],
  };
  const guessedModel = {
    id: "example",
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
    comparison: { provider: "correct", release: "correct" },
    isCorrect: true,
    attemptNumber: 1,
    matchingFamily: [],
    matchingCategories: [],
    matchingInputModalities: [],
    matchingOutputModalities: [],
    matchingUseCases: [],
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/me/streaks")) {
      const empty = {
        currentStreak: 0,
        longestStreak: 0,
        lastStreakDate: null,
        securedToday: false,
        qualifyingDates: [],
      };
      await route.fulfill({
        json: {
          currentGameDate: "2026-09-30",
          classic: {
            currentStreak: completed ? 4 : 3,
            longestStreak: 5,
            lastStreakDate: completed ? "2026-09-30" : "2026-09-29",
            securedToday: completed,
            qualifyingDates: [
              "2026-09-27",
              "2026-09-28",
              "2026-09-29",
              ...(completed ? ["2026-09-30"] : []),
            ],
          },
          timeline: empty,
          emoji: empty,
          logo: empty,
        },
      });
    } else if (path.endsWith("/classic/llm/normal")) {
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
          globalCompletionCount: completed ? 1 : 0,
        },
      });
    } else if (path.endsWith("/guesses")) {
      if (route.request().method() === "POST") {
        completed = true;
        await route.fulfill({ json: { ...guess, globalCompletionCount: 1 } });
      } else
        await route.fulfill({
          json: {
            guesses: completed
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
    } else if (path.endsWith("/hints")) {
      await route.fulfill({ json: { hints: [], availableColumns: [], remainingHints: 0 } });
    } else if (path.endsWith("/auth/me")) await route.fulfill({ json: { user: null } });
    else if (path.endsWith("/public-config"))
      await route.fulfill({ json: { hardcoreSoundtrackUrl: null } });
    else await route.fulfill({ json: {} });
  });
  await page.goto("/classic/llm");
  const consent = page.getByRole("button", { name: /reject|necessary only|essential only/i });
  if (await consent.count()) await consent.first().click();
  const streak = page.locator(".game-streak");
  await expect(streak).toContainText("3 day Classic streak");
  await expect(streak).toContainText("Play any Classic mode today");
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await page.getByRole("combobox").fill("Example");
  await page.getByRole("button", { name: /Example model/ }).click();
  await expect(streak).toContainText("4 day Classic streak");
  await expect(streak).toContainText("Streak secured for today");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("aaidle:progress:v1")!).streaks?.classic.qualifyingDates,
      ),
    )
    .toContain("2026-09-30");
  await page.reload();
  await expect(streak).toContainText("4 day Classic streak");
  await expect(streak).toContainText("Streak secured for today");
});
