// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassicGame } from "../../src/app/components/game/ClassicGame";
import { apiClient, type ClassicGamePayload } from "../../src/lib/api/client";

vi.mock("../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("../../src/lib/storage/use-local-progress", () => ({
  useLocalProgress: () => ({
    playerId: "player-1",
    games: {},
    preferences: {
      hardcoreUnlocked: false,
      innerCircleActive: false,
      hasSeenClassicHowToPlay: true,
    },
    stats: {
      classic: {
        currentStreak: 0,
        bestStreak: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        lastSolvedDate: null,
        lastPlayedDate: null,
        guessDistribution: {},
      },
    },
  }),
}));

vi.mock("../../src/app/components/game/ClassicGameControls", () => ({
  ClassicGameControls: ({ models }: { models: Array<{ id: string; name: string }> }) =>
    createElement(
      "div",
      null,
      models.map((model) => createElement("span", { key: model.id }, model.name)),
    ),
}));

const game = (category: "llm" | "cv", id: string, name: string): ClassicGamePayload => ({
  challenge: {
    id: `challenge-${id}`,
    date: "2026-08-18",
    mode: { category, difficulty: "normal" },
    expiresAt: "2026-08-19T00:00:00.000Z",
    columns: [],
  },
  models: [{ id, name, providerName: "Example", familyName: "Example", aliases: [] }],
  columns: [],
  globalCompletionCount: 0,
});

describe("ClassicGame category cache", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads the selected category instead of reusing the previous category's difficulty cache", async () => {
    const llmGame = game("llm", "llm-model", "LLM candidate");
    const cvGame = game("cv", "cv-model", "CV candidate");
    const classicGame = vi.spyOn(apiClient, "classicGame").mockResolvedValue(cvGame);
    vi.spyOn(apiClient, "classicGuessHistory").mockResolvedValue([]);

    const { rerender } = render(
      createElement(
        MemoryRouter,
        null,
        createElement(ClassicGame, {
          category: "llm",
          difficulty: "normal",
          initialGame: llmGame,
          hasHardcoreAccess: false,
        }),
      ),
    );

    expect(screen.getByText("LLM candidate")).toBeTruthy();

    rerender(
      createElement(
        MemoryRouter,
        null,
        createElement(ClassicGame, {
          category: "cv",
          difficulty: "normal",
          initialGame: llmGame,
          hasHardcoreAccess: false,
        }),
      ),
    );

    await waitFor(() =>
      expect(classicGame).toHaveBeenCalledWith("cv", "normal", expect.any(AbortSignal)),
    );
    expect(await screen.findByText("CV candidate")).toBeTruthy();
  });
});