// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmojiGame } from "../../../src/app/components/game/emoji/EmojiGame";
import { TimelineGame } from "../../../src/app/components/game/timeline/TimelineGame";
import { apiClient } from "../../../src/lib/api/client";
import type { TimelineGamePayload } from "../../../src/lib/domain/games/timeline/timeline-types";

const playerId = "75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9";

const authState = vi.hoisted(() => ({
  user: { id: "user-1", username: "tester" } as { id: string; username: string } | null,
}));

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({
    hardcoreUnlocked: true,
    setAuthenticatedUser: vi.fn(),
    user: authState.user,
  }),
}));

vi.mock("../../../src/lib/storage/use-local-progress", () => ({
  useLocalProgress: () => ({ playerId, preferences: { hellMode: false } }),
}));

const timelineGame: TimelineGamePayload = {
  challenge: {
    id: "bde0eb89-eb16-42d4-ae80-1713ebeb30ee",
    date: "2026-08-31",
    difficulty: "normal",
    expiresAt: "2099-09-01T00:00:00Z",
  },
  slots: [
    {
      position: 0,
      anchor: {
        id: "anchor-old",
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
        id: "anchor-new",
        name: "New anchor",
        itemKind: "model",
        releaseDate: "2024-01-01",
      },
    },
  ],
  movableModels: [
    { id: "model-a", name: "Model A", itemKind: "model" },
    { id: "model-b", name: "Model B", itemKind: "model" },
  ],
  progress: {
    solved: false,
    attemptLimit: null,
    attemptsRemaining: null,
    latestAttempt: null,
  },
};

describe("game submit regressions", () => {
  beforeEach(() => {
    authState.user = { id: "user-1", username: "tester" };
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("submits a complete Timeline arrangement", async () => {
    vi.spyOn(apiClient, "timelineGame").mockResolvedValue(timelineGame);
    const submit = vi.spyOn(apiClient, "submitTimelineAttempt").mockResolvedValue({
      placements: [1, 0, 0, 1],
      attemptsRemaining: null,
      revealedModels: [],
    });

    render(
      <MemoryRouter>
        <TimelineGame />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Model A/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Empty timeline position 2, place selected card",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Model B/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Empty timeline position 3, place selected card",
      }),
    );

    const submitButton = screen.getByRole("button", { name: "Submit complete timeline" });
    expect(submitButton).not.toHaveProperty("disabled", true);
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(timelineGame.challenge.id, playerId, expect.any(String), [
        "anchor-old",
        "model-a",
        "model-b",
        "anchor-new",
      ]),
    );
  });

  it("does not remount Timeline cards when resubmitting an unchanged arrangement", async () => {
    vi.spyOn(apiClient, "timelineGame").mockResolvedValue(timelineGame);
    const submit = vi.spyOn(apiClient, "submitTimelineAttempt").mockResolvedValue({
      placements: [1, 0, 0, 1],
      attemptsRemaining: null,
      revealedModels: [],
    });

    render(
      <MemoryRouter>
        <TimelineGame />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Model A/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Empty timeline position 2, place selected card",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Model B/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Empty timeline position 3, place selected card",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit complete timeline" }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const firstGuessCard = screen.getByRole("button", { name: /Position 2: Model A/ });

    fireEvent.click(screen.getByRole("button", { name: "Submit complete timeline" }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: /Position 2: Model A/ })).toBe(firstGuessCard);
  });

  it("adds a five-second cooldown after an incorrect Speedrun submission", async () => {
    window.localStorage.setItem(
      "aaidle:game-preferences:v1",
      JSON.stringify({ timeline: "speedrun" }),
    );
    vi.spyOn(apiClient, "timelineGame").mockResolvedValue({
      ...timelineGame,
      challenge: { ...timelineGame.challenge, difficulty: "speedrun" },
      progress: {
        ...timelineGame.progress,
        speedrunStartedAt: Date.now() - 1_000,
      },
    });
    const submit = vi.spyOn(apiClient, "submitTimelineAttempt").mockResolvedValue({
      placements: [1, 0, 0, 1],
      attemptsRemaining: null,
      revealedModels: [],
    });

    render(
      <MemoryRouter>
        <TimelineGame />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Model A/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Empty timeline position 2, place selected card",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Model B/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Empty timeline position 3, place selected card",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit complete timeline" }));

    const cooldownButton = await screen.findByRole("button", { name: "Submit again in 5s" });
    expect(cooldownButton).toHaveProperty("disabled", true);
    fireEvent.click(cooldownButton);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("keeps Timeline feedback at the card bottom and places the correct year after its check", async () => {
    vi.spyOn(apiClient, "timelineGame").mockResolvedValue({
      ...timelineGame,
      movableModels: [
        { ...timelineGame.movableModels[0]!, releaseDate: "2020-01-01" },
        { ...timelineGame.movableModels[1]!, releaseDate: "2021-01-01" },
      ],
      progress: {
        ...timelineGame.progress,
        latestAttempt: {
          modelOrder: ["anchor-old", "model-a", "model-b", "anchor-new"],
          placements: [1, 1, 0, 1],
          attemptNumber: 1,
        },
      },
    });

    render(
      <MemoryRouter>
        <TimelineGame />
      </MemoryRouter>,
    );

    const correctCard = await screen.findByRole("button", {
      name: /Position 2: Model A, correct/,
    });
    const incorrectCard = screen.getByRole("button", {
      name: /Position 3: Model B, incorrect/,
    });
    const correctResult = correctCard.querySelector(".timeline-card__result");
    const incorrectResult = incorrectCard.querySelector(".timeline-card__result");

    expect(correctResult).not.toBeNull();
    const correctText = correctResult?.textContent ?? "";
    expect(correctText.indexOf("Correct position")).toBeLessThan(correctText.indexOf("2020"));
    expect(incorrectResult?.textContent).toContain("Incorrect position");
  });

  it("confirms giving up an active Speedrun and marks it unfinished", async () => {
    window.localStorage.setItem(
      "aaidle:game-preferences:v1",
      JSON.stringify({ timeline: "speedrun" }),
    );
    vi.spyOn(apiClient, "timelineGame").mockResolvedValue({
      ...timelineGame,
      challenge: { ...timelineGame.challenge, difficulty: "speedrun" },
      progress: {
        ...timelineGame.progress,
        speedrunStartedAt: Date.now() - 1_000,
      },
    });
    const giveUp = vi
      .spyOn(apiClient, "giveUpTimelineSpeedrun")
      .mockResolvedValue({ givenUpAt: Date.now() });

    render(
      <MemoryRouter>
        <TimelineGame />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Give up" }));
    expect(screen.getByRole("dialog", { name: "Give up this Speedrun?" })).not.toBeNull();
    expect(giveUp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Give up Speedrun" }));

    await waitFor(() =>
      expect(giveUp).toHaveBeenCalledWith(timelineGame.challenge.id, playerId),
    );
    expect(await screen.findByText("Unfinished")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Submit complete timeline" })).toBeNull();
  });

  it("submits the selected Emoji answer", async () => {
    vi.spyOn(apiClient, "hardcoreStatus").mockResolvedValue({
      signedIn: false,
      unlocked: false,
      completedCategories: [],
      requiredCategories: [],
    });
    vi.spyOn(apiClient, "emojiGame").mockResolvedValue({
      challenge: {
        id: "a629df1e-33bf-4ad1-b2ac-8fe5e0b1a7f5",
        date: "2026-08-31",
        mode: "emoji",
        difficulty: "normal",
        expiresAt: "2099-09-01T00:00:00Z",
        clues: [{ type: "emoji", value: "🤖" }],
        maximumClues: 3,
      },
      entities: [
        {
          id: "gpt",
          name: "GPT",
          aliases: ["Generative Pre-trained Transformer"],
          entityKind: "model",
        },
      ],
      globalCompletionCount: 0,
    });
    vi.spyOn(apiClient, "emojiGuessHistory").mockResolvedValue({ guesses: [], clues: [] });
    const submit = vi.spyOn(apiClient, "submitEmojiGuess").mockResolvedValue({
      entity: { id: "gpt", name: "GPT", aliases: [], entityKind: "model" },
      isCorrect: false,
      attemptNumber: 1,
      globalCompletionCount: 0,
      clues: [{ type: "emoji", value: "🤖" }],
    });

    render(
      <MemoryRouter>
        <EmojiGame difficulty="normal" onDifficultyChange={vi.fn()} />
      </MemoryRouter>,
    );

    const input = await screen.findByRole("combobox", { name: "Name the answer" });
    fireEvent.change(input, { target: { value: "GPT" } });
    fireEvent.click(screen.getByRole("button", { name: "Guess" }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        "a629df1e-33bf-4ad1-b2ac-8fe5e0b1a7f5",
        playerId,
        expect.any(String),
        "gpt",
        1,
      ),
    );
  });
});
