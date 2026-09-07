import { expect, test } from "@playwright/test";

// Deterministic browser coverage; the Rust HTTP tests cover server-side eligibility.
for (const profile of [
  { revealProfile: "progressive-zoom", focalPoint: { x: 256, y: 256 } },
  { revealProfile: "gaussian-blur", blurStartStrength: 28, blurStepStrength: 4 },
] as const)
  test(`Logo ${profile.revealProfile} clues open, animate, and retain viewed state after reload`, async ({
    page,
  }) => {
    const challengeId = "1d10665e-31dc-460b-8964-a9a293671bee";
    const imageUrl = `/api/v1/games/logo/challenges/${challengeId}/image?v=0`;
    const clueImageUrl = `/api/v1/games/logo/challenges/${challengeId}/image?v=clue-1`;
    const clues = [
      {
        afterIncorrectGuesses: 0,
        kind: "general",
        text: "This clue is available before guessing.",
      },
      {
        afterIncorrectGuesses: 1,
        kind: "image",
        text: "An image clue caption.",
        imageUrl: clueImageUrl,
      },
    ];
    const model = {
      id: "wrong",
      name: "Wrong answer",
      providerName: "Test",
      familyName: null,
      aliases: [],
    };
    let guessed = false;
    const progress = () => ({
      imageUrl,
      ...profile,
      imageRevision: guessed ? 1 : 0,
      maximumImageRevision: 7,
      clues: guessed ? clues : clues.slice(0, 1),
      solved: false,
    });
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/image")) {
        await route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      } else if (url.pathname.endsWith("/logo/normal")) {
        await route.fulfill({
          json: {
            challenge: {
              id: challengeId,
              date: "2026-09-03",
              mode: "logo:normal",
              difficulty: "normal",
              expiresAt: "2099-09-04T00:00:00Z",
            },
            models: [model],
            progress: progress(),
            globalCompletionCount: 0,
          },
        });
      } else if (url.pathname.endsWith("/guesses")) {
        if (route.request().method() === "POST") {
          guessed = true;
          await route.fulfill({
            json: {
              guessedModel: model,
              isCorrect: false,
              attemptNumber: 1,
              progress: progress(),
              globalCompletionCount: 0,
            },
          });
        } else {
          await route.fulfill({
            json: {
              guesses: guessed ? [{ model, isCorrect: false, attemptNumber: 1 }] : [],
              progress: progress(),
            },
          });
        }
      } else {
        await route.fulfill({ json: { user: null } });
      }
    });
    await page.goto("/logo");
    const sourceImage = page.getByAltText("Visual clue at reveal 1");
    await expect(sourceImage).toHaveAttribute("src", imageUrl);
    if (profile.revealProfile === "gaussian-blur") {
      await expect(sourceImage).toHaveCSS("object-fit", "contain");
    }

    const consent = page.getByRole("button", { name: /reject|necessary only|essential only/i });
    if (await consent.count()) await consent.first().click();
    const firstClue = page.getByRole("button", { name: "Clue 1: general, available" });
    await expect(firstClue).toBeVisible();
    await expect(page.getByText(clues[0].text)).toHaveCount(0);
    await firstClue.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Clue 1" })).toBeVisible();
    await expect(page.getByText(clues[0].text)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Clue 1: general, viewed" })).toBeFocused();
    await page.reload();
    await expect(page.getByRole("button", { name: "Clue 1: general, viewed" })).toBeVisible();
    await page.getByRole("combobox", { name: "Name the answer" }).fill("Wrong");
    await page.getByRole("button", { name: /Wrong answer/ }).click();
    const imageClue = page.getByRole("button", { name: "Clue 2: image, available" });
    await expect(imageClue).toBeVisible();
    await expect(imageClue).toHaveCSS("animation-name", "logo-clue-appear");
    await imageClue.click();
    const image = page.getByRole("img", { name: "Image for clue 2" });
    await expect(image).toHaveAttribute("src", clueImageUrl);
    await expect(image).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".logo-clue-content")).toHaveCSS("animation-name", "none");
  });

test("shared Logo and Emoji originals are published as public images", async ({ request }) => {
  for (const path of [
    "/common/edge/input.png",
    "/common/edge/output.png",
    "/logo-visual/lytics.png",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect((await response.body()).subarray(1, 4).toString()).toBe("PNG");
  }
});
