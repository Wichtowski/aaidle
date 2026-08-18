import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient, isApiUnavailable, NetworkError } from "../../../src/lib/api/client";

const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("v1 API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("submits a Classic guess with the caller’s stable player and request IDs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        guessedModel: {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "OpenAI",
          family: ["GPT", "4", "o"],
        },
        comparison: { provider: "correct" },
        isCorrect: false,
        globalCompletionCount: 7,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.submitClassicGuess(
      "2c8d3858-8e24-4ad0-b1d3-7d231af19a58",
      "75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9",
      "2ad7aefe-9a37-41cb-b0cd-43d068c0a1eb",
      "gpt-4o",
      3,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/games/classic/challenges/2c8d3858-8e24-4ad0-b1d3-7d231af19a58/guesses",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      playerId: "75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9",
      requestId: "2ad7aefe-9a37-41cb-b0cd-43d068c0a1eb",
      guessedModelId: "gpt-4o",
      attemptNumber: 3,
    });
  });

  it("asks Emoji Clues for server-earned hints only", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ clues: [{ type: "emoji", value: "🧠" }] }));
    vi.stubGlobal("fetch", fetchMock);
    await apiClient.emojiCluesHints(
      "2c8d3858-8e24-4ad0-b1d3-7d231af19a58",
      "75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9",
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/games/emoji-clues/challenges/2c8d3858-8e24-4ad0-b1d3-7d231af19a58/hints?playerId=75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9",
    );
  });

  it("loads accepted Emoji Clues guesses for the in-game history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        guesses: [{ id: "gpt-4o", name: "GPT-4o", isCorrect: false, attemptNumber: 1 }],
        clues: [{ type: "emoji", value: "🧠" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const history = await apiClient.emojiCluesGuessHistory(
      "2c8d3858-8e24-4ad0-b1d3-7d231af19a58",
      "75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9",
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/games/emoji-clues/challenges/2c8d3858-8e24-4ad0-b1d3-7d231af19a58/guesses?playerId=75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9",
    );
    expect(history.guesses).toEqual([
      { id: "gpt-4o", name: "GPT-4o", isCorrect: false, attemptNumber: 1 },
    ]);
  });

  it("loads accepted Classic guesses for rendering in the board", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        guesses: [
          {
            requestId: "2ad7aefe-9a37-41cb-b0cd-43d068c0a1eb",
            attemptedAt: 1_785_552_000_000,
            attemptNumber: 1,
            isCorrect: false,
            guessedModel: {
              id: "gpt-4o",
              name: "GPT-4o",
              provider: "OpenAI",
              country: "United States",
              family: ["GPT", "4", "o"],
              categories: ["language model"],
              inputModalities: ["text"],
              outputModalities: ["text"],
              useCases: ["general"],
              reasoningSupport: "optional",
              weightAvailability: "closed",
              categoryDetails: {},
              releaseYear: 2024,
              releaseDate: "2024-05-13",
              contextWindowTokens: 128000,
            },
            comparison: { provider: "incorrect" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const history = await apiClient.classicGuessHistory(
      "2c8d3858-8e24-4ad0-b1d3-7d231af19a58",
      "75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9",
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/games/classic/challenges/2c8d3858-8e24-4ad0-b1d3-7d231af19a58/guesses?playerId=75f5c6f0-0f47-4dc2-b094-a1acb1e1cbf9",
    );
    expect(history[0]).toMatchObject({
      requestId: "2ad7aefe-9a37-41cb-b0cd-43d068c0a1eb",
      attemptNumber: 1,
      model: { id: "gpt-4o", country: "United States", releaseYear: 2024 },
    });
  });

  it("keeps unauthenticated auth checks anonymous and distinguishes connectivity failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(apiClient.currentUser()).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiClient.currentUser()).rejects.toBeInstanceOf(NetworkError);
    expect(isApiUnavailable(new NetworkError())).toBe(true);
    expect(isApiUnavailable(new ApiError("Duplicate", 409, "DUPLICATE_GUESS"))).toBe(false);
  });
});
