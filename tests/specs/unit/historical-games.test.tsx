// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameDateNavigation } from "../../../src/app/components/game/common/layout/GameDateNavigation";
import { AuthContext, type AuthContextValue } from "../../../src/app/components/auth/auth-context";
import { freshProgress, replaceProgress } from "../../../src/lib/storage/local-progress-store";
import {
  adjacentGameDate,
  dailyGamePath,
  parseGameRouteDate,
} from "../../../src/lib/domain/challenges/historical-dates";
import type { GameStreaks } from "../../../src/lib/validation/streaks";

const empty = {
  currentStreak: 0,
  longestStreak: 0,
  lastStreakDate: null,
  securedToday: false,
  qualifyingDates: [],
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
});
