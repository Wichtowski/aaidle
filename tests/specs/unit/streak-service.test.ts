import { describe, it, expect } from "vitest";
import {
  applySolvedStreak,
  calculateSolvedStreaks,
} from "../../../src/lib/domain/players/streak-service";
describe("streaks", () => {
  it("starts a streak", () =>
    expect(
      applySolvedStreak({ currentStreak: 0, bestStreak: 0, lastSolvedDate: null }, "2026-08-11")
        .currentStreak,
    ).toBe(1));
  it("increments next day", () =>
    expect(
      applySolvedStreak(
        { currentStreak: 1, bestStreak: 1, lastSolvedDate: "2026-08-10" },
        "2026-08-11",
      ).currentStreak,
    ).toBe(2));
  it("does not increment same day", () =>
    expect(
      applySolvedStreak(
        { currentStreak: 2, bestStreak: 2, lastSolvedDate: "2026-08-11" },
        "2026-08-11",
      ).currentStreak,
    ).toBe(2));
  it("resets after gap without lowering best", () =>
    expect(
      applySolvedStreak(
        { currentStreak: 4, bestStreak: 4, lastSolvedDate: "2026-08-08" },
        "2026-08-11",
      ),
    ).toMatchObject({ currentStreak: 1, bestStreak: 4 }));

  it("keeps the most recent streak when older solved history contains a gap", () => {
    expect(
      calculateSolvedStreaks([
        "2026-08-31",
        "2026-08-30",
        "2026-08-20",
        "2026-08-19",
        "2026-08-18",
      ]),
    ).toEqual({ currentStreak: 2, bestStreak: 3 });
  });
});
