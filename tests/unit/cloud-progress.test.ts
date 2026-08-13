import { describe, expect, it } from "vitest";
import { mergeCloudProgress } from "../../lib/domain/players/cloud-progress";
import { classicChallengeMode } from "../../lib/domain/models/model-types";
import { freshProgress } from "../../lib/storage/local-progress-store";

describe("cloud progress", () => {
  it("preserves solved games from both devices while merging sync data", () => {
    const first = freshProgress();
    const second = freshProgress();
    const date = "2026-08-13";
    const firstKey = `${classicChallengeMode("llm", "normal")}:${date}`;
    const secondKey = `${classicChallengeMode("cv", "challenge")}:${date}`;

    first.games[firstKey] = {
      challengeId: "llm-challenge",
      challengeDate: date,
      mode: classicChallengeMode("llm", "normal"),
      status: "solved",
      guesses: [],
      startedAt: `${date}T00:00:00.000Z`,
      completedAt: `${date}T00:05:00.000Z`,
    };
    second.games[secondKey] = {
      challengeId: "cv-challenge",
      challengeDate: date,
      mode: classicChallengeMode("cv", "challenge"),
      status: "solved",
      guesses: [],
      startedAt: `${date}T00:00:00.000Z`,
      completedAt: `${date}T00:05:00.000Z`,
    };

    const merged = mergeCloudProgress(first, second);

    expect(Object.keys(merged.games)).toEqual(expect.arrayContaining([firstKey, secondKey]));
    expect(merged.stats.classic.gamesWon).toBe(2);
  });
});
