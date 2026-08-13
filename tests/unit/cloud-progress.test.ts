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

  it("keeps permanent Inner Circle state when a fresh device syncs", () => {
    const cloud = freshProgress();
    const freshDevice = freshProgress();
    cloud.playerId = "11111111-1111-4111-8111-111111111111";
    freshDevice.playerId = "22222222-2222-4222-8222-222222222222";
    cloud.preferences.hardcoreUnlocked = true;
    cloud.preferences.hasAutoplayedHardcoreSoundtrack = true;

    const merged = mergeCloudProgress(cloud, freshDevice);

    expect(merged.playerId).toBe(cloud.playerId);
    expect(merged.preferences.hardcoreUnlocked).toBe(true);
    expect(merged.preferences.hasAutoplayedHardcoreSoundtrack).toBe(true);
  });

  it("retains a legacy Hardcore unlock while merging progress", () => {
    const cloud = freshProgress();
    const incoming = freshProgress();
    cloud.preferences.hardcoreUnlocked = true;

    const merged = mergeCloudProgress(cloud, incoming);

    expect(merged.preferences.hardcoreUnlocked).toBe(true);
  });
});
