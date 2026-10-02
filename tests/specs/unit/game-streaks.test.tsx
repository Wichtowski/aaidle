// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../../src/lib/api/client";
import { GameStreak } from "../../../src/app/components/game/common/layout/GameStreak";
import {
  freshProgress,
  progressKey,
  readProgress,
  replaceProgress,
} from "../../../src/lib/storage/local-progress-store";
import { streakForDay } from "../../../src/lib/domain/players/streak-display";
import { gameStreaksSchema, type GameStreaks } from "../../../src/lib/validation/streaks";

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) =>
  new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);

function streaks(securedToday = false): GameStreaks {
  const empty = {
    currentStreak: 0,
    longestStreak: 0,
    lastStreakDate: null,
    securedToday: false,
  };
  return {
    currentGameDate: today,
    classic: {
      currentStreak: 3,
      longestStreak: 5,
      lastStreakDate: securedToday ? today : daysAgo(1),
      securedToday,
    },
    timeline: empty,
    emoji: empty,
    logo: empty,
  };
}
// The store is exercised against an explicit in-memory storage, so the test does not
// depend on which Web Storage implementation the runtime provides
const setItem = vi.fn();
beforeEach(() => {
  const values = new Map<string, string>();
  setItem.mockReset();
  setItem.mockImplementation((key: string, value: string) => values.set(key, value));
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
      removeItem: (key: string) => values.delete(key),
    },
  });
  replaceProgress(freshProgress());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("family streaks", () => {
  it("shows one family requirement and refreshes server-confirmed state after a submission", async () => {
    replaceProgress(freshProgress());
    const get = vi
      .spyOn(apiClient, "gameStreaks")
      .mockResolvedValueOnce(streaks())
      .mockResolvedValue(streaks(true));
    render(<GameStreak family="classic" />);
    expect(await screen.findByText(/3 day Classic streak/)).toBeTruthy();
    expect(screen.getByText("Play any Classic mode today to keep it going.")).toBeTruthy();
    act(() => window.dispatchEvent(new Event("aaidle:game-progress")));
    expect(await screen.findByText(/Streak secured for today/)).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
    expect(readProgress().streaks?.classic.lastStreakDate).toBe(today);
    expect(JSON.parse(window.localStorage.getItem(progressKey)!)).toMatchObject({
      version: 1,
      streaks: { currentGameDate: today },
    });
    // The family streak never overwrites the per-mode Classic statistics
    expect(readProgress().stats.classic.currentStreak).toBe(0);

    // An unchanged refresh does not rewrite the store or notify its subscribers
    const stored = window.localStorage.getItem(progressKey);
    setItem.mockClear();
    act(() => window.dispatchEvent(new Event("aaidle:game-progress")));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    await Promise.resolve();
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(progressKey)).toBe(stored);
  });
  it("does not present a cached streak from an earlier day as secured or still running", async () => {
    const cached = (lastStreakDate: string, currentGameDate: string): GameStreaks => ({
      ...streaks(),
      currentGameDate,
      classic: { currentStreak: 4, longestStreak: 6, lastStreakDate, securedToday: true },
    });
    expect(streakForDay(cached(daysAgo(1), daysAgo(1)), "classic", today)).toMatchObject({
      currentStreak: 4,
      securedToday: false,
    });
    expect(streakForDay(cached(daysAgo(2), daysAgo(2)), "classic", today)).toMatchObject({
      currentStreak: 0,
      longestStreak: 6,
      securedToday: false,
    });
    expect(streakForDay(cached(today, today), "classic", today)).toMatchObject({
      currentStreak: 4,
      securedToday: true,
    });
    expect(streakForDay(streaks(), "emoji", daysAgo(-1))).toMatchObject({
      currentStreak: 0,
      securedToday: false,
    });

    replaceProgress({ ...freshProgress(), streaks: cached(daysAgo(2), daysAgo(2)) });
    vi.spyOn(apiClient, "gameStreaks").mockRejectedValue(new Error("offline"));
    render(<GameStreak family="classic" />);
    expect(screen.getByText(/0 day Classic streak/)).toBeTruthy();
    expect(screen.queryByText(/Streak secured for today/)).toBeNull();
    await waitFor(() =>
      expect(screen.getByText("Streak sync unavailable - showing saved progress.")).toBeTruthy(),
    );
  });
  it("keeps independently persisted family state after a reload and labels sync failures", async () => {
    replaceProgress({ ...freshProgress(), streaks: streaks(true) });
    vi.spyOn(apiClient, "gameStreaks").mockRejectedValue(new Error("offline"));
    const view = render(<GameStreak family="timeline" />);
    expect(screen.getByText(/0 day Timeline streak/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/sync unavailable/)).toBeTruthy());
    view.unmount();
    render(<GameStreak family="classic" />);
    expect(screen.getByText(/3 day Classic streak/)).toBeTruthy();
  });
  it("validates canonical dates and does not submit cached counters or dates", async () => {
    expect(gameStreaksSchema.safeParse({ ...streaks(), currentGameDate: "20260230" }).success).toBe(
      false,
    );
    expect(
      gameStreaksSchema.safeParse({
        ...streaks(),
        classic: { ...streaks().classic, currentStreak: -1 },
      }).success,
    ).toBe(false);
    expect(
      gameStreaksSchema.safeParse({
        ...streaks(),
        classic: { ...streaks().classic, lastStreakDate: "2026-02-30" },
      }).success,
    ).toBe(false);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(streaks())));
    vi.stubGlobal("fetch", fetch);
    await apiClient.gameStreaks();
    expect(fetch.mock.calls[0]![0]).toBe("/api/v1/me/streaks");
    expect(fetch.mock.calls[0]![1].body).toBeUndefined();
    expect(fetch.mock.calls[0]![1].cache).toBe("no-store");
  });
});
