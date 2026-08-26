import { describe, expect, it } from "vitest";
import {
  adjacentMovablePosition,
  initialTimelinePositions,
  moveTimelineModel,
  restoreTimelinePositions,
  timelineArrangementIsComplete,
} from "@lib/domain/games/timeline/timeline-arrangement";
import type { TimelineGamePayload } from "@lib/domain/games/timeline/timeline-types";

const game: TimelineGamePayload = {
  challenge: {
    id: "challenge-id",
    date: "2026-08-26",
    difficulty: "normal",
    expiresAt: "2026-08-27T00:00:00Z",
  },
  slots: [
    {
      position: 0,
      anchor: {
        id: "anchor-old",
        name: "Old anchor",
        itemKind: "model",
        releaseDate: "2018-01-01",
      },
    },
    { position: 1, anchor: null },
    { position: 2, anchor: null },
    {
      position: 3,
      anchor: {
        id: "anchor-new",
        name: "New anchor",
        itemKind: "event",
        releaseDate: "2024-01-01",
      },
    },
  ],
  movableModels: [
    { id: "movable-a", name: "Movable A", itemKind: "model" },
    { id: "movable-b", name: "Movable B", itemKind: "model" },
  ],
  progress: {
    solved: false,
    attemptLimit: null,
    attemptsRemaining: null,
    latestAttempt: null,
  },
};

describe("Timeline arrangement", () => {
  it("keeps anchors fixed while placing and swapping movable items", () => {
    const anchors = new Set([0, 3]);
    const initial = initialTimelinePositions(game);
    const placed = moveTimelineModel(initial, anchors, "movable-a", 1);
    const filled = moveTimelineModel(placed, anchors, "movable-b", 2);
    const swapped = moveTimelineModel(filled, anchors, "movable-a", 2);

    expect(initial).toEqual(["anchor-old", null, null, "anchor-new"]);
    expect(swapped).toEqual(["anchor-old", "movable-b", "movable-a", "anchor-new"]);
    expect(moveTimelineModel(swapped, anchors, "movable-a", 0)).toBe(swapped);
    expect(
      timelineArrangementIsComplete(
        swapped,
        new Set(["anchor-old", "movable-a", "movable-b", "anchor-new"]),
      ),
    ).toBe(true);
  });

  it("rejects corrupt saved arrangements and skips anchors for keyboard movement", () => {
    expect(
      restoreTimelinePositions(game, ["anchor-old", "movable-a", "movable-a", "anchor-new"]),
    ).toBeNull();
    expect(
      restoreTimelinePositions(game, ["movable-a", "anchor-old", "movable-b", "anchor-new"]),
    ).toBeNull();
    expect(adjacentMovablePosition(2, 1, 4, new Set([3]))).toBe(2);
    expect(adjacentMovablePosition(2, -1, 4, new Set([0]))).toBe(1);
  });
});
