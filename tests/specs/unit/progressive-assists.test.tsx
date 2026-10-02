// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../../src/lib/api/client";
import { ClassicHints } from "../../../src/app/components/game/classic/ClassicHints";
import { useTimelineGame } from "../../../src/app/components/game/timeline/use-timeline-game";
import {
  applyTimelineAssistance,
  applyTimelineAutoPlacements,
} from "../../../src/lib/domain/games/timeline/timeline-arrangement";
import type { TimelineGamePayload } from "../../../src/lib/domain/games/timeline/timeline-types";
import { formatHintValue } from "../../../src/lib/domain/guesses/value-format";
import { localProgressSchema } from "../../../src/lib/storage/local-progress-schema";
import { classicAssistSchema, timelineAssistSchema } from "../../../src/lib/validation/api";

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("progressive assists", () => {
  it("lets the player select a column and restores only revealed hints", async () => {
    const state = {
      hints: [],
      availableColumns: ["provider", "release"] as const,
      remainingHints: 1,
    };
    const assists = vi
      .spyOn(apiClient, "classicAssists")
      .mockResolvedValueOnce({ ...state, availableColumns: [...state.availableColumns] })
      .mockResolvedValue({
        hints: [{ column: "provider", value: "OpenAI" }],
        availableColumns: ["release"],
        remainingHints: 0,
      });
    const view = render(<ClassicHints challengeId="challenge" gameKey="game" attempts={1} />);
    expect(screen.queryByText("OpenAI")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /^Provider$/ }));
    expect(await screen.findByText("OpenAI")).toBeTruthy();
    expect(assists).toHaveBeenLastCalledWith("challenge", "provider");
    expect(screen.queryByRole("button", { name: /^Release$/ })).toBeNull();
    view.unmount();
    render(<ClassicHints challengeId="challenge" gameKey="game" attempts={1} />);
    expect(await screen.findByText("OpenAI")).toBeTruthy();
  });

  it("reports a failed hint request and allows retrying retrieval", async () => {
    const assists = vi
      .spyOn(apiClient, "classicAssists")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ hints: [], availableColumns: ["release"], remainingHints: 1 });
    render(<ClassicHints challengeId="challenge" gameKey="game" attempts={1} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry hints" }));
    expect(await screen.findByRole("button", { name: /^Release$/ })).toBeTruthy();
    expect(assists).toHaveBeenCalledTimes(2);
  });

  it("sends only the explicitly selected property or card and validates responses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ hints: [], availableColumns: ["release"], remainingHints: 1 }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            autoPlacements: [{ cardId: "chosen", position: 2 }],
            incorrectSubmissions: 3,
            unlockEvery: 3,
            remainingAutoPlacements: 0,
            availableCardIds: ["other"],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await apiClient.classicAssists("classic", "release");
    await apiClient.timelineAssists("timeline", "chosen");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ column: "release" });
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ cardId: "chosen" });
    expect(
      classicAssistSchema.safeParse({
        hints: [{ column: "name", value: "hidden" }],
        availableColumns: [],
        remainingHints: 0,
      }).success,
    ).toBe(false);
    expect(
      timelineAssistSchema.safeParse({
        autoPlacements: [],
        incorrectSubmissions: -1,
        unlockEvery: 3,
        remainingAutoPlacements: 0,
        availableCardIds: [],
      }).success,
    ).toBe(false);
    expect(
      timelineAssistSchema.safeParse({
        autoPlacements: [{ cardId: "chosen", position: -1 }],
        incorrectSubmissions: 3,
        unlockEvery: 3,
        remainingAutoPlacements: 0,
        availableCardIds: [],
      }).success,
    ).toBe(false);
  });

  it("places the selected card without duplicates and preserves other fixed cards", () => {
    const positions = ["anchor", "second", "first", null];
    const result = applyTimelineAutoPlacements(positions, [
      { cardId: "first", position: 1 },
      { cardId: "third", position: 3 },
    ]);
    expect(result).toEqual(["anchor", "first", "second", "third"]);
    expect(applyTimelineAutoPlacements(result, [{ cardId: "first", position: 1 }])).toEqual(result);
    expect(positions).toEqual(["anchor", "second", "first", null]);
  });
  it("clears stale feedback for every card an Auto-place moved", () => {
    const positions = ["old", "b", "a", "new"];
    const placements = [1, 0, 0, 1] as const;
    const applied = applyTimelineAssistance(
      positions,
      [...placements],
      [{ cardId: "a", position: 1 }],
    );
    expect(applied.positions).toEqual(["old", "a", "b", "new"]);
    // "b" was displaced onto position 2 and has not been judged there yet
    expect(applied.placements).toEqual([1, 1, null, 1]);

    const again = applyTimelineAssistance(applied.positions, applied.placements, [
      { cardId: "a", position: 1 },
    ]);
    expect(again.positions).toBe(applied.positions);
    expect(again.placements).toBe(applied.placements);
    expect(applyTimelineAssistance(positions, null, [])).toEqual({ positions, placements: null });
    expect(
      applyTimelineAssistance(["old", null, null, "new"], null, [{ cardId: "a", position: 1 }]),
    ).toEqual({ positions: ["old", "a", null, "new"], placements: [null, 1, null, null] });
  });

  it("does not show a displaced card as incorrect after restoring an Auto-place", async () => {
    const anchor = (id: string, releaseDate: string) => ({
      id,
      name: id,
      itemKind: "model" as const,
      releaseDate,
    });
    const game: TimelineGamePayload = {
      challenge: {
        id: "timeline",
        date: new Date().toISOString().slice(0, 10),
        difficulty: "normal",
        expiresAt: "2099-01-01T00:00:00Z",
      },
      slots: [
        { position: 0, anchor: anchor("old", "2019-01-01") },
        { position: 1, anchor: null },
        { position: 2, anchor: null },
        { position: 3, anchor: anchor("new", "2024-01-01") },
      ],
      movableModels: [
        { id: "b", name: "B", itemKind: "model", categories: [] },
        { id: "a", name: "A", itemKind: "model", categories: [] },
      ],
      progress: {
        solved: false,
        attemptsRemaining: null,
        latestAttempt: {
          attemptNumber: 3,
          modelOrder: ["old", "b", "a", "new"],
          placements: [1, 0, 0, 1],
        },
      },
    } as unknown as TimelineGamePayload;
    vi.spyOn(apiClient, "timelineGame").mockResolvedValue(game);
    vi.spyOn(apiClient, "timelineAssists").mockResolvedValue({
      autoPlacements: [{ cardId: "a", position: 1 }],
      incorrectSubmissions: 3,
      unlockEvery: 3,
      remainingAutoPlacements: 0,
      availableCardIds: ["b"],
    });
    const { result } = renderHook(() =>
      useTimelineGame({ canSpeedrun: false, hardcoreUnlocked: false, playerId: "player" }),
    );
    await waitFor(() => expect(result.current.positions).toEqual(["old", "a", "b", "new"]));
    expect(result.current.placements).toEqual([1, 1, null, 1]);
    expect(result.current.assistance?.autoPlacements).toHaveLength(1);
  });

  it("formats revealed hints like the matching board cell", async () => {
    expect(formatHintValue("toolUse", true)).toBe("Yes");
    expect(formatHintValue("multimodal", false)).toBe("No");
    expect(formatHintValue("architecture", [])).toBe("N/A");
    expect(formatHintValue("architecture", ["detr", "resnet-50"])).toBe("detr, resnet-50");
    expect(formatHintValue("contextWindowTokens", 128_000)).toBe("128K");
    expect(formatHintValue("contextWindowTokens", null)).toBe("N/A");
    expect(formatHintValue("license", null)).toBe("N/A");
    expect(formatHintValue("release", 2024)).toBe("2024");

    vi.spyOn(apiClient, "classicAssists").mockResolvedValue({
      hints: [
        { column: "toolUse", value: true },
        { column: "contextWindowTokens", value: 128_000 },
        { column: "architecture", value: [] },
      ],
      availableColumns: [],
      remainingHints: 0,
    });
    render(<ClassicHints challengeId="challenge" gameKey="game" attempts={1} />);
    const hints = await screen.findByRole("region", { name: "Classic hints" });
    await waitFor(() => expect(hints.textContent).toContain("Tool calling: Yes"));
    expect(hints.textContent).toContain("128K");
    expect(hints.textContent).toContain("Architecture: N/A");
    expect(hints.textContent).not.toContain("true");
  });

  it("keeps a revealed hint when an older refresh resolves after it", async () => {
    const empty = { hints: [], availableColumns: ["provider" as const], remainingHints: 1 };
    const revealed = {
      hints: [{ column: "provider" as const, value: "OpenAI" }],
      availableColumns: [],
      remainingHints: 0,
    };
    let resolveRefresh: (state: typeof empty) => void = () => undefined;
    const assists = vi
      .spyOn(apiClient, "classicAssists")
      .mockResolvedValueOnce(empty)
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveRefresh = resolve as typeof resolveRefresh)),
      )
      .mockResolvedValue(revealed);
    const view = render(<ClassicHints challengeId="challenge" gameKey="game" attempts={1} />);
    const button = await screen.findByRole("button", { name: /^Provider$/ });
    // A second guess starts a refresh that is still in flight when the hint is revealed
    view.rerender(<ClassicHints challengeId="challenge" gameKey="game" attempts={2} />);
    await waitFor(() => expect(assists).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: /^Provider$/ })).toBe(button);
    fireEvent.click(button);
    expect(await screen.findByText("OpenAI")).toBeTruthy();
    resolveRefresh(empty);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("OpenAI")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Provider$/ })).toBeNull();
  });

  it("never resets stored progress because of an unknown hint column", () => {
    const stored = (hints: unknown) => ({
      version: 1,
      playerId: "8f6f2a7e-7d0f-4b5c-9d2e-3f5a1c2b4d6e",
      activeMode: "classic",
      games: {
        game: {
          challengeId: "challenge",
          challengeDate: "2026-09-30",
          mode: "classic:llm:normal",
          status: "in-progress",
          guesses: [],
          startedAt: "2026-09-30T10:00:00.000Z",
          completedAt: null,
          hints,
        },
      },
      stats: {
        classic: {
          currentStreak: 2,
          bestStreak: 3,
          gamesPlayed: 4,
          gamesWon: 3,
          lastPlayedDate: null,
          lastSolvedDate: null,
          guessDistribution: {},
        },
      },
      preferences: { reducedMotion: false, highContrast: false },
    });
    const renamed = localProgressSchema.parse(
      stored([{ column: "renamedColumn", value: { nested: true } }]),
    );
    expect(renamed.games.game?.hints).toEqual([
      { column: "renamedColumn", value: { nested: true } },
    ]);
    const malformed = localProgressSchema.parse(stored("not a list"));
    expect(malformed.games.game?.hints).toBeUndefined();
    expect(malformed.stats.classic.gamesPlayed).toBe(4);
    expect(
      timelineAssistSchema.safeParse({
        autoPlacements: [],
        incorrectSubmissions: 4,
        unlockEvery: 4,
        remainingAutoPlacements: 1,
        availableCardIds: [],
      }).success,
    ).toBe(true);
  });
});
