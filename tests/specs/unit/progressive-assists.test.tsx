// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../../src/lib/api/client";
import { ClassicHints } from "../../../src/app/components/game/classic/ClassicHints";
import { applyTimelineAutoPlacements } from "../../../src/lib/domain/games/timeline/timeline-arrangement";
import { classicAssistSchema, timelineAssistSchema } from "../../../src/lib/validation/api";

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
});
