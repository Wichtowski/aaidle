// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineGlobalLeaderboard } from "../../../src/app/components/game/timeline/TimelineGlobalLeaderboard";
import { apiClient } from "../../../src/lib/api/client";

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({ user: { username: "runner" } }),
}));

afterEach(() => vi.restoreAllMocks());

describe("TimelineGlobalLeaderboard", () => {
  it("switches between the three global rankings and shows public trend data", async () => {
    const entry = {
      rank: 1,
      displayName: "runner",
      isCurrentUser: true,
      completedSpeedruns: 2,
      averageTimeMs: 15_000,
      averageSubmissions: 3,
      fastestTimeMs: 10_000,
      recentRuns: [
        { date: "2026-08-29", submissions: 2, timeMs: 10_000 },
        { date: "2026-08-30", submissions: 4, timeMs: 20_000 },
      ],
    };
    vi.spyOn(apiClient, "globalTimelineLeaderboard").mockResolvedValueOnce({
      fastest: [entry],
      average: [entry],
      completions: [entry],
    });

    render(createElement(TimelineGlobalLeaderboard));

    expect(await screen.findByText("10.0s")).toBeVisible();
    expect(screen.getByText("runner").tagName).toBe("STRONG");
    expect(screen.getByRole("img", { name: /runner's time trend over 2/ })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Average time" }));
    expect(screen.getByText("15.0s")).toHaveClass("timeline-global-leaderboard__value");

    fireEvent.click(screen.getByRole("tab", { name: "Completed" }));
    expect(screen.getByText("2 runs")).toBeVisible();
  });
});
