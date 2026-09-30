// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../../src/lib/api/client";
import { GameStreak } from "../../../src/app/components/game/common/layout/GameStreak";
import {
  freshProgress,
  progressKey,
  readProgress,
  replaceProgress,
} from "../../../src/lib/storage/local-progress-store";
import { gameStreaksSchema, type GameStreaks } from "../../../src/lib/validation/streaks";

function streaks(securedToday = false): GameStreaks {
  const empty = {
    currentStreak: 0,
    longestStreak: 0,
    lastStreakDate: null,
    securedToday: false,
    qualifyingDates: [],
  };
  return {
    currentGameDate: "2026-09-30",
    classic: {
      currentStreak: 3,
      longestStreak: 5,
      lastStreakDate: securedToday ? "2026-09-30" : "2026-09-29",
      securedToday,
      qualifyingDates: [
        "2026-09-27",
        "2026-09-28",
        "2026-09-29",
        ...(securedToday ? ["2026-09-30"] : []),
      ],
    },
    timeline: empty,
    emoji: empty,
    logo: empty,
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  replaceProgress(freshProgress());
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
    expect(await screen.findByText("Streak secured for today ✓")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
    expect(readProgress().streaks?.classic.qualifyingDates).toContain("2026-09-30");
    expect(JSON.parse(window.localStorage.getItem(progressKey)!)).toMatchObject({
      version: 1,
      streaks: { currentGameDate: "2026-09-30" },
    });
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
