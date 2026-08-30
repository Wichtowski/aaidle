// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineLeaderboard } from "../../../src/app/components/game/timeline/TimelineLeaderboard";
import { apiClient } from "../../../src/lib/api/client";

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({ user: { username: "runner" } }),
}));

afterEach(() => vi.restoreAllMocks());

describe("TimelineLeaderboard", () => {
  it("shows submission count and time for every entry", async () => {
    vi.spyOn(apiClient, "currentTimelineLeaderboard").mockResolvedValueOnce({
      challengeDate: "2026-08-30",
      entries: [
        {
          rank: 1,
          displayName: "runner",
          isCurrentUser: false,
          submissions: 2,
          timeMs: 12_345,
        },
        {
          rank: 2,
          displayName: "challenger",
          isCurrentUser: false,
          submissions: 3,
          timeMs: 15_000,
        },
      ],
    });

    render(createElement(TimelineLeaderboard));

    const submissions = await screen.findAllByText("submissions");
    expect(submissions[0]?.parentElement).toHaveTextContent("2 submissions");
    expect(screen.getByText("12.3s")).toHaveClass("timeline-leaderboard__time");
    expect(screen.getByText("runner").tagName).toBe("STRONG");
    expect(screen.getByText("challenger").tagName).toBe("SPAN");
    expect(screen.getByText("🥇")).toBeVisible();
    expect(screen.getByText("🥈")).toBeVisible();
    expect(screen.getByText("1st place")).toHaveClass("sr-only");
  });
});
