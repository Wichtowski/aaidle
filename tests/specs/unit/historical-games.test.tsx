// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameDateNavigation } from "../../../src/app/components/game/common/layout/GameDateNavigation";
import { AuthContext, type AuthContextValue } from "../../../src/app/components/auth/auth-context";
import { freshProgress, replaceProgress } from "../../../src/lib/storage/local-progress-store";
import {
  adjacentGameDate,
  dailyGamePath,
  parseGameRouteDate,
} from "../../../src/lib/domain/challenges/historical-dates";
import { AuthenticatedRoute } from "../../../src/app/components/auth/AuthenticatedRoute";
import { HistoricalGameGuard } from "../../../src/app/components/game/common/HistoricalGameGuard";
import { rememberReturnPath, takeReturnPath } from "../../../src/lib/storage/return-path";
import type { GameStreaks } from "../../../src/lib/validation/streaks";

const empty = {
  currentStreak: 0,
  longestStreak: 0,
  lastStreakDate: null,
  securedToday: false,
};
const streaks: GameStreaks = {
  currentGameDate: "2026-09-30",
  classic: empty,
  timeline: empty,
  emoji: empty,
  logo: empty,
};
const auth = { user: { id: "user" } } as AuthContextValue;
function Path() {
  return <output>{useLocation().pathname}</output>;
}
function view(date: string, path: string, signedIn = true) {
  replaceProgress({ ...freshProgress(), streaks });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={signedIn ? auth : { ...auth, user: null }}>
        <GameDateNavigation date={date} basePath="/classic/llm" />
        <Path />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  replaceProgress(freshProgress());
});
describe("historical daily dates", () => {
  it("rejects malformed calendar dates and handles UTC day arithmetic", () => {
    for (const value of ["abc", "20261301", "20260230", "202608111", "20260229", "2026-08-11"])
      expect(parseGameRouteDate(value)).toBeNull();
    expect(parseGameRouteDate("20260811")).toBe("2026-08-11");
    expect(parseGameRouteDate("20280229")).toBe("2028-02-29");
    expect(adjacentGameDate("2026-09-01", -1)).toBe("2026-08-31");
    expect(adjacentGameDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(dailyGamePath("/timeline", "2026-09-30", "2026-09-30")).toBe("/timeline");
  });
  it("hides history arrows for guests and never renders a future arrow on today", () => {
    const guest = view("2026-09-30", "/classic/llm", false);
    expect(screen.queryByRole("link")).toBeNull();
    guest.unmount();
    view("2026-09-30", "/classic/llm");
    expect(screen.queryByRole("link", { name: "Next daily game" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Previous daily game" }));
    expect(screen.getByText("/classic/llm/20260929")).toBeTruthy();
  });
  it("hides the launch-day previous arrow and navigates back to the clean today URL", () => {
    const first = view("2026-08-11", "/classic/llm/20260811");
    expect(screen.queryByRole("link", { name: "Previous daily game" })).toBeNull();
    expect(screen.getByText(/History/)).toBeTruthy();
    first.unmount();
    view("2026-09-29", "/classic/llm/20260929");
    fireEvent.click(screen.getByRole("link", { name: "Next daily game" }));
    expect(screen.getByText("/classic/llm")).toBeTruthy();
  });
  it("canonicalizes a direct dated URL for today using the server day", async () => {
    view("2026-09-30", "/classic/llm/20260930");
    expect(await screen.findByText("/classic/llm")).toBeTruthy();
  });
  it("returns to the dated game that required signing in, and only to in-app paths", () => {
    render(
      <MemoryRouter initialEntries={["/classic/od/20260820?from=share"]}>
        <AuthContext.Provider value={{ ...auth, user: null, loading: false }}>
          <Routes>
            <Route element={<AuthenticatedRoute />}>
              <Route path="/classic/:category/:date" element={<p>Game</p>} />
            </Route>
            <Route path="/login" element={<Path />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByText("/login")).toBeTruthy();
    expect(takeReturnPath()).toBe("/classic/od/20260820?from=share");
    // The target is used once
    expect(takeReturnPath()).toBeNull();
    for (const unsafe of ["https://evil.example", "//evil.example", "/\\evil.example", "profile"]) {
      rememberReturnPath(unsafe);
      expect(takeReturnPath()).toBeNull();
    }
  });
  it("does not reject a valid day because the cached game day is stale", () => {
    const today = new Date().toISOString().slice(0, 10);
    const compact = (date: string) => date.replaceAll("-", "");
    const guard = (date: string, cachedDay: string) => {
      replaceProgress({ ...freshProgress(), streaks: { ...streaks, currentGameDate: cachedDay } });
      return render(
        <MemoryRouter initialEntries={[`/timeline/${date}`]}>
          <AuthContext.Provider value={auth}>
            <Routes>
              <Route
                path="/timeline/:date"
                element={
                  <HistoricalGameGuard>
                    <p>Game</p>
                  </HistoricalGameGuard>
                }
              />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>,
      );
    };
    // The cache says an earlier day; the requested day is still not in the future
    guard(compact(today), "2026-08-15").unmount();
    guard(compact(adjacentGameDate(today, -1)), "2026-08-15");
    expect(screen.getByText("Game")).toBeTruthy();
    cleanup();
    for (const invalid of [compact(adjacentGameDate(today, 1)), "20260810", "20260230", "abc"]) {
      guard(invalid, today);
      expect(screen.getByText("Daily game unavailable")).toBeTruthy();
      cleanup();
    }
    // A fresh server day ahead of a lagging client clock is honoured
    const tomorrow = adjacentGameDate(today, 1);
    guard(compact(tomorrow), tomorrow);
    expect(screen.getByText("Game")).toBeTruthy();
  });
});
