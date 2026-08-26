import { expect, test } from "../../fixtures/e2e";

const itemOrder = ["anchor-old", "movable-a", "movable-b", "movable-c", "movable-d", "anchor-new"];

test("Timeline supports arranging, positional feedback, retrying, and winning", async ({
  page,
  timelinePage,
}) => {
  let acceptedSubmissions = 0;
  const submittedOrders: string[][] = [];
  await page.route("**/api/v1/games/timeline/normal?*", async (route) => {
    const solved = acceptedSubmissions >= 2;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        challenge: {
          id: "bde0eb89-eb16-42d4-ae80-1713ebeb30ee",
          date: "2026-08-26",
          difficulty: "normal",
          expiresAt: "2099-08-27T00:00:00Z",
        },
        slots: [
          {
            position: 0,
            anchor: {
              id: "anchor-old",
              name: "Old anchor",
              itemKind: "model",
              releaseDate: "2018-01-01",
            },
          },
          { position: 1, anchor: null },
          { position: 2, anchor: null },
          { position: 3, anchor: null },
          { position: 4, anchor: null },
          {
            position: 5,
            anchor: {
              id: "anchor-new",
              name: "New anchor",
              itemKind: "event",
              releaseDate: "2025-01-01",
            },
          },
        ],
        movableModels: [
          {
            id: "movable-c",
            name: "Movable C",
            itemKind: "model",
            ...(solved && { releaseDate: "2022-01-01" }),
          },
          {
            id: "movable-a",
            name: "Movable A",
            itemKind: "model",
            ...(solved && { releaseDate: "2020-01-01" }),
          },
          {
            id: "movable-d",
            name: "Movable D",
            itemKind: "event",
            ...(solved && { releaseDate: "2023-01-01" }),
          },
          {
            id: "movable-b",
            name: "Movable B",
            itemKind: "model",
            ...(solved && { releaseDate: "2021-01-01" }),
          },
        ],
        progress: {
          solved,
          attemptLimit: null,
          attemptsRemaining: null,
          latestAttempt: null,
        },
      }),
    });
  });
  await page.route("**/api/v1/games/timeline/challenges/*/attempts", async (route) => {
    const request = route.request().postDataJSON() as { modelOrder: string[] };
    submittedOrders.push(request.modelOrder);
    acceptedSubmissions += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        placements: acceptedSubmissions === 1 ? [1, 0, 0, 1, 1, 1] : [1, 1, 1, 1, 1, 1],
        attemptsRemaining: null,
      }),
    });
  });

  await timelinePage.goto();
  await expect(timelinePage.heading).toBeVisible();
  await expect(timelinePage.difficultyNavigation).toBeVisible();
  await expect(timelinePage.submitButton).toBeDisabled();

  for (const [name, position] of [
    ["Movable B", 2],
    ["Movable A", 3],
    ["Movable C", 4],
    ["Movable D", 5],
  ] as const) {
    await page.getByRole("button", { name }).click();
    await page
      .getByRole("button", { name: `Empty timeline position ${position}, place selected card` })
      .click();
  }

  await expect(timelinePage.submitButton).toBeEnabled();
  await timelinePage.submitButton.click();
  await expect(page.getByText("Incorrect position")).toBeVisible();

  await page.getByRole("button", { name: /Position 2: Movable B/ }).click();
  await page.getByRole("button", { name: /Position 3: Movable A/ }).click();
  await expect(page.getByText("Incorrect position")).toHaveCount(0);
  await timelinePage.submitButton.click();

  await expect(page.getByRole("dialog", { name: "Perfect chronology." })).toBeVisible();
  expect(submittedOrders).toHaveLength(2);
  expect(new Set(submittedOrders[0])).toEqual(new Set(itemOrder));
  expect(submittedOrders[0][0]).toBe("anchor-old");
  expect(submittedOrders[0][5]).toBe("anchor-new");
});
