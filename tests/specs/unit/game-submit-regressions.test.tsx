// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmojiGame } from "../../../src/app/components/game/emoji/EmojiGame";
import { LogoGame } from "../../../src/app/components/game/logo/LogoGame";
import { TimelineGame } from "../../../src/app/components/game/timeline/TimelineGame";
import { ApiError, apiClient, type LogoGamePayload } from "../../../src/lib/api/client";
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

const logoGame: LogoGamePayload = {
  challenge: {
    id: "1d10665e-31dc-460b-8964-a9a293671bee",
    date: "2026-09-01",
    mode: "logo:normal",
    difficulty: "normal",
    expiresAt: "2099-09-02T00:00:00Z",
  },
  models: [
    {
      id: "model-a",
      name: "Model A",
      providerName: "Provider",
      familyName: null,
      aliases: [],
    },
  ],
  progress: {
    imageUrl: "/logo-assets/asset-001.webp",
    revealProfile: "progressive-zoom",
    focalPoint: { x: 256, y: 256 },
    imageRevision: 0,
    maximumImageRevision: 7,
    clues: [],
    solved: false,
  },
  globalCompletionCount: 0,
};

describe("game submit regressions", () => {
  beforeEach(() => {
    authState.user = { id: "user-1", username: "tester" };
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        clear: () => values.clear(),
      },
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
      }),
    });
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

  it("silently restores Logo history when a submission uses stale client state", async () => {
    vi.spyOn(apiClient, "logoGame").mockResolvedValue(logoGame);
    const history = vi
      .spyOn(apiClient, "logoGuessHistory")
      .mockResolvedValueOnce({ guesses: [], progress: logoGame.progress })
      .mockResolvedValueOnce({
        guesses: [
          {
            model: logoGame.models[0],
            isCorrect: false,
            attemptNumber: 1,
          },
        ],
        progress: { ...logoGame.progress, imageRevision: 1 },
      });
    vi.spyOn(apiClient, "submitLogoGuess").mockRejectedValue(
      new ApiError(
        "Your saved guesses changed. Reload the challenge and try again.",
        409,
        "STALE_GUESS_STATE",
      ),
    );

    render(
      <MemoryRouter>
        <LogoGame />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByRole("combobox", { name: "Name the answer" }), {
      target: { value: "Model A" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Model A/ }));

    await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Incorrect")).toBeTruthy();
    expect(screen.getByText("Your saved guesses were restored.")).toBeTruthy();
  });

  it("opens the Logo winning screen when solved history has no renderable winning guess", async () => {
    const solvedProgress = { ...logoGame.progress, solved: true };
    vi.spyOn(apiClient, "logoGame").mockResolvedValue({
      ...logoGame,
      progress: solvedProgress,
      globalCompletionCount: 12,
    });
    vi.spyOn(apiClient, "logoGuessHistory").mockResolvedValue({
      guesses: [],
      progress: solvedProgress,
    });

    render(
      <MemoryRouter>
        <LogoGame />
      </MemoryRouter>,
    );

    const revealedLogo = await screen.findByAltText("Fully revealed logo");
    expect(revealedLogo).toHaveClass("is-solved");
    expect(revealedLogo).toHaveStyle({ "--logo-solve-start-zoom": "4.2" });

    fireEvent.click(screen.getByRole("button", { name: "Show winning guess" }));
    expect(screen.getByRole("dialog", { name: "Winning guess" })).toBeInTheDocument();
  });

  it("counts opened Logo clues once instead of counting every unlocked clue", async () => {
    const progress = {
      ...logoGame.progress,
      solved: true,
      clues: [
        { afterIncorrectGuesses: 0, kind: "general", text: "First hint" },
        { afterIncorrectGuesses: 0, kind: "general", text: "Second hint" },
      ],
    };
    vi.spyOn(apiClient, "logoGame").mockResolvedValue({ ...logoGame, progress });
    vi.spyOn(apiClient, "logoGuessHistory").mockResolvedValue({ guesses: [], progress });
    render(
      <MemoryRouter>
        <LogoGame />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Clue 1: general, available" }));
    fireEvent.click(screen.getByRole("button", { name: "Close clue" }));
    fireEvent.click(screen.getByRole("button", { name: "Clue 1: general, viewed" }));
    fireEvent.click(screen.getByRole("button", { name: "Close clue" }));
    fireEvent.click(screen.getByRole("button", { name: "Show winning guess" }));
    expect(screen.getByText("Clues used").parentElement).toHaveTextContent("1Clues used");
  });

  it("renders Gaussian blur without focal-point positioning or a zoom completion animation", async () => {
    const { focalPoint: _focalPoint, ...base } = logoGame.progress as Extract<
      LogoGamePayload["progress"],
      { revealProfile: "progressive-zoom" }
    >;
    const progress: LogoGamePayload["progress"] = {
      ...base,
      revealProfile: "gaussian-blur",
      blurStartStrength: 28,
      blurStepStrength: 4,
      imageRevision: 1,
      solved: true,
    };
    vi.spyOn(apiClient, "logoGame").mockResolvedValue({ ...logoGame, progress });
    vi.spyOn(apiClient, "logoGuessHistory").mockResolvedValue({ guesses: [], progress });
    render(
      <MemoryRouter>
        <LogoGame />
      </MemoryRouter>,
    );
    const image = await screen.findByAltText("Fully revealed logo");
    expect(image).toHaveClass("is-blur-profile", "is-solved");
    expect(image).toHaveStyle({
      "--logo-solve-start-zoom": "1",
      "--logo-solve-start-blur": "24px",
      transformOrigin: "center",
    });
    expect(screen.getByText(/watch the image become clearer/)).toBeVisible();
  });

  it("opens and closes Timeline rules and year annotations", async () => {
    vi.spyOn(apiClient, "timelineGame").mockResolvedValue({
      ...timelineGame,
      slots: timelineGame.slots.map((slot) =>
        slot.anchor
          ? {
              ...slot,
              anchor: { ...slot.anchor, yearAnnotation: "Recorded publication year." },
            }
          : slot,
      ),
    });

    render(
      <MemoryRouter>
        <TimelineGame />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Timeline rules" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Timeline rules" }));
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show year note for Old anchor" }));
    expect(screen.getByRole("dialog", { name: "Old anchor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close year note" }));
    expect(screen.queryByRole("dialog", { name: "Old anchor" })).not.toBeInTheDocument();
  });

  it("moves a selected Timeline card with keyboard navigation", async () => {
    vi.spyOn(apiClient, "timelineGame").mockResolvedValue(timelineGame);

    render(
      <MemoryRouter>
        <TimelineGame />
      </MemoryRouter>,
    );

    const model = await screen.findByRole("button", { name: /Model A/ });
    fireEvent.click(model);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Empty timeline position 2, place selected card",
      }),
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /Position 2: Model A/ }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("button", { name: /Position 3: Model A/ })).toBeInTheDocument();
  });

  it("shows the Timeline retry state after a load failure", async () => {
    const load = vi
      .spyOn(apiClient, "timelineGame")
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(timelineGame);

    render(
      <MemoryRouter>
        <TimelineGame />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Game unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Timeline arrangement" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
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

    await waitFor(() => expect(giveUp).toHaveBeenCalledWith(timelineGame.challenge.id, playerId));
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
