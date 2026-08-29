import { describe, expect, it } from "vitest";
import {
  mergeCloudProgress,
  mergeServerProgress,
} from "../../../src/lib/domain/players/cloud-progress";
import { classicChallengeMode } from "../../../src/lib/domain/models/model-types";
import { freshProgress } from "../../../src/lib/storage/local-progress-store";

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

  it("syncs the active Inner Circle lock so a Hardcore win can release it", () => {
    const inactive = freshProgress();
    const active = freshProgress();
    active.preferences.innerCircleActive = true;

    expect(mergeCloudProgress(inactive, active).preferences.innerCircleActive).toBe(true);
    expect(mergeCloudProgress(active, inactive).preferences.innerCircleActive).toBe(false);
  });

  it("uses the server identity, statistics, and authorization-backed preferences", () => {
    const server = freshProgress();
    const local = freshProgress();
    server.playerId = "11111111-1111-4111-8111-111111111111";
    local.playerId = "22222222-2222-4222-8222-222222222222";
    server.stats.classic.gamesWon = 42;
    server.stats.classic.gamesPlayed = 42;
    server.preferences.hardcoreUnlocked = false;
    server.preferences.hellMode = false;
    local.preferences.hardcoreUnlocked = true;
    local.preferences.hellMode = true;

    const merged = mergeServerProgress(server, local);

    expect(merged.playerId).toBe(server.playerId);
    expect(merged.stats.classic.gamesWon).toBe(42);
    expect(merged.preferences.hardcoreUnlocked).toBe(false);
    expect(merged.preferences.hellMode).toBe(false);
  });

  it("keeps an authorized local Hell Mode preference across a stale response", () => {
    const server = freshProgress();
    const local = freshProgress();
    server.preferences.hardcoreUnlocked = true;
    server.preferences.hellMode = false;
    local.preferences.hellMode = true;

    const merged = mergeServerProgress(server, local);

    expect(merged.preferences.hellMode).toBe(true);
  });
});
