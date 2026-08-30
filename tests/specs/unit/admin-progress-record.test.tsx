// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminProgressRecord } from "../../../src/app/components/admin/AdminProgressRecord";
import { classicColumns } from "../../../src/lib/domain/guesses/comparison-types";
import { distribution } from "../../../src/lib/utils/dates";

afterEach(cleanup);

describe("AdminProgressRecord", () => {
  it("summarizes valid synced progress instead of rendering its raw JSON", () => {
    render(
      createElement(AdminProgressRecord, {
        progress: {
          version: 1,
          playerId: "00000000-0000-4000-8000-000000000000",
          activeMode: "classic",
          games: {},
          stats: {
            classic: {
              currentStreak: 0,
              bestStreak: 0,
              gamesPlayed: 0,
              gamesWon: 0,
              lastPlayedDate: null,
              lastSolvedDate: null,
              guessDistribution: distribution(),
            },
          },
          preferences: {
            reducedMotion: false,
            highContrast: false,
            hasSeenClassicPrivacy: false,
            hardcoreUnlocked: false,
            hellMode: false,
          },
        },
        trajectoryTargets: {},
        trajectoryReferenceModels: [],
      }),
    );

    expect(screen.getByText("Default settings")).toBeTruthy();
    expect(screen.getByText("Recent saved games")).toBeTruthy();
    expect(screen.getByText("No games have been saved in this progress record.")).toBeTruthy();
    expect(screen.queryByText(/"playerId"/)).toBeNull();
  });

  it("handles legacy or invalid progress records without exposing raw data", () => {
    render(
      createElement(AdminProgressRecord, {
        progress: { playerId: "not-a-valid-record" },
        trajectoryTargets: {},
        trajectoryReferenceModels: [],
      }),
    );

    expect(screen.getByText(/cannot be displayed/)).toBeTruthy();
  });

  it("renders the compact server progress format", () => {
    render(
      createElement(AdminProgressRecord, {
        progress: {
          version: 1,
          playerId: "00000000-0000-4000-8000-000000000000",
          games: [
            {
              challengeId: "challenge-1",
              challengeDate: "2026-08-13",
              mode: "classic:llm:normal",
              startedAt: "2026-08-13T12:00:00.000Z",
              completedAt: "2026-08-13T12:01:00.000Z",
            },
          ],
          stats: { currentStreak: 1, bestStreak: 2, gamesPlayed: 3 },
          preferences: {
            hasSeenClassicHowToPlay: true,
            innerCircleActive: false,
            hellMode: false,
            hasAutoplayedHardcoreSoundtrack: false,
          },
        },
        trajectoryTargets: {},
        trajectoryReferenceModels: [],
      }),
    );

    expect(screen.getByText("2026-08-13")).toBeTruthy();
    expect(screen.queryByText(/cannot be displayed/)).toBeNull();
  });

  it("shows an interactive trajectory only for a solved game with an available answer", () => {
    render(
      createElement(AdminProgressRecord, {
        progress: {
          version: 1,
          playerId: "00000000-0000-4000-8000-000000000000",
          activeMode: "classic",
          games: {
            "classic:llm:normal:2026-08-13": {
              challengeId: "challenge-1",
              challengeDate: "2026-08-13",
              mode: "classic:llm:normal",
              status: "solved",
              guesses: [
                {
                  requestId: "00000000-0000-4000-8000-000000000001",
                  modelId: "guess-1",
                  modelName: "First guess",
                  attemptedAt: "2026-08-13T12:00:00.000Z",
                  attemptNumber: 1,
                  isCorrect: false,
                  sameGuessCount: 0,
                  matchingCategories: [],
                  matchingInputModalities: [],
                  matchingOutputModalities: [],
                  matchingUseCases: [],
                  model: {
                    id: "guess-1",
                    name: "First guess",
                    releaseYear: 2024,
                    contextWindowTokens: 128_000,
                    categories: ["Language model"],
                  },
                  comparison: Object.fromEntries(
                    classicColumns.map((column) => [column, "incorrect"]),
                  ),
                },
              ],
              startedAt: "2026-08-13T12:00:00.000Z",
              completedAt: "2026-08-13T12:01:00.000Z",
            },
          },
          stats: {
            classic: {
              currentStreak: 1,
              bestStreak: 1,
              gamesPlayed: 1,
              gamesWon: 1,
              lastPlayedDate: "2026-08-13",
              lastSolvedDate: "2026-08-13",
              guessDistribution: distribution(),
            },
          },
          preferences: {
            reducedMotion: false,
            highContrast: false,
            hasSeenClassicPrivacy: false,
            hardcoreUnlocked: false,
            hellMode: false,
          },
        },
        trajectoryTargets: {
          "challenge-1": {
            id: "answer-1",
            name: "Answer model",
            provider: null,
            country: null,
            family: [],
            categories: ["Language model"],
            inputModalities: ["Text"],
            outputModalities: ["Text"],
            useCases: ["Chat"],
            reasoningSupport: "native",
            weightAvailability: "closed",
            releaseYear: 2025,
            releaseDate: "2025-01-01",
            contextWindowTokens: 256_000,
          },
        },
        trajectoryReferenceModels: [
          {
            id: "reference-1",
            name: "Reference model",
            provider: null,
            country: null,
            family: [],
            categories: ["Language model"],
            inputModalities: ["Text"],
            outputModalities: ["Text"],
            useCases: ["Chat"],
            reasoningSupport: "native",
            weightAvailability: "restricted",
            releaseYear: 2023,
            releaseDate: "2023-01-01",
            contextWindowTokens: 32_000,
          },
        ],
      }),
    );

    expect(
      screen.getByRole("img", { name: "Three-dimensional guess trajectory toward Answer model" }),
    ).toBeTruthy();
    expect(screen.getByText("Latest solved-game trajectory")).toBeTruthy();
    expect(screen.getByText("1 guesses · 1 references")).toBeTruthy();
  });
});
