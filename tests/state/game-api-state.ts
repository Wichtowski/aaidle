import type { Page } from "@playwright/test";
import { classicColumns } from "../../src/lib/domain/guesses/comparison-types";
import { consentState } from "./consent-state";

export async function mockGames(page: Page, signedIn = true) {
  const playerId = "75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9";
  const complete = new Set<string>();
  const records = new Map<string, { family: string; date: string }>();
  const requests: string[] = [];
  const publicModel = {
    id: "example",
    name: "Example model",
    providerName: "Test",
    familyName: null,
    aliases: [],
  };
  const model = {
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
    guessedModel: model,
    comparison: Object.fromEntries(classicColumns.map((column) => [column, "correct"])),
    isCorrect: true,
    attemptNumber: 1,
    matchingFamily: [],
    matchingCategories: [],
    matchingInputModalities: [],
    matchingOutputModalities: [],
    matchingUseCases: [],
  };
  const preferences = {
    hasSeenClassicHowToPlay: true,
    innerCircleActive: false,
    hellMode: false,
    hasAutoplayedHardcoreSoundtrack: false,
  };
  await page.context().addCookies(consentState("http://127.0.0.1:5173").cookies);
  await page.addInitScript(() =>
    localStorage.setItem(
      "aaidle:how-to-play:v1",
      JSON.stringify({ "classic:llm:normal": true, "classic:cv:normal": true }),
    ),
  );
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    const parts = path.slice("/api/v1/".length).split("/");
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: signedIn
            ? {
                id: "user",
                email: "user@example.test",
                displayName: "Player",
                username: "player",
                emailVerified: true,
                permission: "user",
                disabled: false,
                disabledReason: null,
              }
            : null,
        },
      });
    if (path.endsWith("/auth/hardcore-status"))
      return route.fulfill({
        json: {
          signedIn,
          unlocked: false,
          completedCategories: [],
          requiredCategories: ["llm", "cv", "nlp", "od", "classical-ml", "filters"],
        },
      });
    if (path.endsWith("/auth/progress"))
      return route.fulfill({
        json: {
          progress: {
            version: 1,
            playerId,
            games: [],
            stats: { currentStreak: 0, bestStreak: 0, gamesPlayed: 0 },
            preferences,
          },
        },
      });
    if (path.endsWith("/auth/progress/preferences")) return route.fulfill({ status: 204 });
    if (path.endsWith("/me/streaks")) {
      const empty = {
        currentStreak: 0,
        longestStreak: 0,
        lastStreakDate: null,
        securedToday: false,
        qualifyingDates: [],
      };
      return route.fulfill({
        json: {
          currentGameDate: "2026-09-30",
          classic: empty,
          timeline: empty,
          emoji: empty,
          logo: empty,
        },
      });
    }
    if (parts[0] === "games" && parts[2] !== "challenges") {
      const family = parts[1]!;
      const compact = (family === "classic" ? parts[4] : parts[3]) ?? "20260930";
      const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
      if (!signedIn && compact !== "20260930")
        return route.fulfill({
          status: 401,
          json: {
            error: { code: "UNAUTHORIZED", message: "Sign in to play historical daily games." },
          },
        });
      if (!/^\d{8}$/.test(compact) || date < "2026-08-11" || date > "2026-09-30")
        return route.fulfill({
          status: 404,
          json: { error: { code: "NOT_FOUND", message: "Daily game unavailable." } },
        });
      const index =
        ["classic", "timeline", "emoji", "logo"].indexOf(family) + 1 + (parts[2] === "cv" ? 10 : 0);
      const id = `00000000-0000-4000-8000-${compact}${String(index).padStart(4, "0")}`;
      records.set(id, { family, date });
      const challenge = {
        id,
        date,
        mode: `${family}:normal`,
        difficulty: "normal",
        expiresAt: "2099-10-01T00:00:00Z",
      };
      if (family === "classic")
        return route.fulfill({
          json: {
            challenge: { ...challenge, mode: `classic:${parts[2]}:normal` },
            models: [publicModel],
            columns: ["provider", "release"],
            globalCompletionCount: complete.has(id) ? 1 : 0,
          },
        });
      if (family === "timeline")
        return route.fulfill({
          json: {
            challenge,
            slots: [
              {
                position: 0,
                anchor: {
                  id: "old",
                  name: "Old anchor",
                  itemKind: "model",
                  releaseDate: "2000-01-01",
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
                  releaseDate: "2025-01-01",
                },
              },
            ],
            movableModels: [
              { id: "a", name: `Card A ${date}`, itemKind: "model" },
              { id: "b", name: `Card B ${date}`, itemKind: "model" },
            ],
            progress: {
              solved: false,
              attemptLimit: null,
              attemptsRemaining: null,
              latestAttempt: null,
            },
          },
        });
      if (family === "emoji")
        return route.fulfill({
          json: {
            challenge: { ...challenge, clues: [{ type: "emoji", value: "🤖" }], maximumClues: 1 },
            entities: [{ id: "entity", name: "Example idea", aliases: [], entityKind: "emoji" }],
            globalCompletionCount: 0,
          },
        });
      if (family === "logo")
        return route.fulfill({
          json: {
            challenge,
            models: [publicModel],
            progress: {
              imageUrl:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E",
              imageRevision: 0,
              maximumImageRevision: 0,
              clues: [],
              revealProfile: null,
              solved: false,
            },
            globalCompletionCount: 0,
          },
        });
    }
    if (parts[2] === "challenges") {
      const id = parts[3]!;
      if (parts[4] === "guesses" && records.get(id)?.family === "classic") {
        if (route.request().method() === "POST") {
          complete.add(id);
          return route.fulfill({ json: { ...guess, globalCompletionCount: 1 } });
        }
        return route.fulfill({
          json: {
            guesses: complete.has(id)
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
      }
      if (parts[4] === "hints")
        return route.fulfill({
          json:
            parts[1] === "classic"
              ? { hints: [], availableColumns: [], remainingHints: 0 }
              : { clues: [{ type: "emoji", value: "🤖" }] },
        });
      if (parts[4] === "auto-place")
        return route.fulfill({
          json: {
            autoPlacements: [],
            incorrectSubmissions: 0,
            unlockEvery: 3,
            remainingAutoPlacements: 0,
            availableCardIds: ["a", "b"],
          },
        });
      if (parts[4] === "guesses" && parts[1] === "emoji")
        return route.fulfill({ json: { guesses: [], clues: [{ type: "emoji", value: "🤖" }] } });
      if (parts[4] === "guesses" && parts[1] === "logo")
        return route.fulfill({
          json: {
            guesses: [],
            progress: {
              imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
              imageRevision: 0,
              maximumImageRevision: 0,
              clues: [],
              revealProfile: null,
              solved: false,
            },
          },
        });
    }
    return route.fulfill({ json: {} });
  });
  return { requests, complete };
}
