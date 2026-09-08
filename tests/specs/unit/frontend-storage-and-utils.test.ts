import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { distribution, expiresAt, utcDate } from "../../../src/lib/utils/dates";
import {
  gamePreferencesKey,
  readGamePreferences,
  saveClassicPreference,
  saveEmojiDifficulty,
  saveTimelineDifficulty,
  updateGamePreferences,
} from "../../../src/lib/storage/game-preferences";
import {
  hasSeenClassicHowToPlay,
  markClassicHowToPlaySeen,
} from "../../../src/lib/storage/how-to-play-preferences";
import {
  readSavedTimelineGame,
  readSavedTimelineGames,
  saveTimelineGame,
  type SavedTimelineGame,
} from "../../../src/lib/domain/games/timeline/timeline-progress-store";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const installWindow = () => {
  const localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
  return localStorage;
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("date utilities", () => {
  it("formats dates in UTC rather than local time", () => {
    expect(utcDate(new Date("2025-01-02T23:59:59.999Z"))).toBe("2025-01-02");
  });

  it("returns the next UTC midnight for a challenge date", () => {
    expect(expiresAt("2025-06-15")).toBe(new Date("2025-06-16T00:00:00.000Z").getTime());
  });

  it("creates all distribution buckets initialized to zero", () => {
    expect(distribution()).toEqual({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8+": 0 });
  });
});

describe("game preferences", () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = installWindow();
  });

  it("returns defaults when storage is empty or malformed", () => {
    expect(readGamePreferences()).toEqual({
      classic: { category: "llm", difficulty: "normal" },
      emoji: "normal",
      timeline: "normal",
      logo: "normal",
    });
    storage.setItem(gamePreferencesKey, "not json");
    expect(readGamePreferences().classic).toEqual({ category: "llm", difficulty: "normal" });
  });

  it("keeps valid values while replacing invalid nested values", () => {
    storage.setItem(
      gamePreferencesKey,
      JSON.stringify({ classic: { category: "cv", difficulty: "hardcore" }, emoji: "invalid", timeline: "speedrun" }),
    );
    expect(readGamePreferences()).toEqual({
      classic: { category: "cv", difficulty: "hardcore" },
      emoji: "normal",
      timeline: "speedrun",
      logo: "normal",
    });
  });

  it("saves each supported preference through the shared updater", () => {
    saveClassicPreference("filters", "challenge");
    saveEmojiDifficulty("hardcore");
    saveTimelineDifficulty("speedrun");
    updateGamePreferences((preferences) => ({ ...preferences, logo: "normal" }));
    expect(readGamePreferences()).toMatchObject({
      classic: { category: "filters", difficulty: "challenge" },
      emoji: "hardcore",
      timeline: "speedrun",
    });
  });
});

describe("how-to-play preferences", () => {
  it("supports the legacy flag and category-specific seen state", () => {
    installWindow();
    expect(hasSeenClassicHowToPlay("llm", "normal", true)).toBe(true);
    expect(hasSeenClassicHowToPlay("llm", "normal", false)).toBe(false);
    markClassicHowToPlaySeen("llm", "normal");
    expect(hasSeenClassicHowToPlay("llm", "normal", false)).toBe(true);
    expect(hasSeenClassicHowToPlay("cv", "normal", false)).toBe(false);
  });

  it("ignores malformed and false storage entries", () => {
    const storage = installWindow();
    storage.setItem("aaidle:how-to-play:v1", JSON.stringify({ "classic:llm:normal": false, "": true }));
    expect(hasSeenClassicHowToPlay("llm", "normal", false)).toBe(false);
    storage.setItem("aaidle:how-to-play:v1", "{");
    expect(hasSeenClassicHowToPlay("llm", "normal", false)).toBe(false);
  });
});

const timelineGame = (challengeId: string): SavedTimelineGame => ({
  challengeId,
  challengeDate: "2025-01-01",
  difficulty: "normal",
  positions: ["a", null],
  placements: null,
  acceptedAttempts: 1,
  attemptsRemaining: 2,
  solved: false,
  updatedAt: "2025-01-01T00:00:00Z",
});

describe("timeline progress storage", () => {
  it("saves and reads one game and lists saved games", () => {
    installWindow();
    saveTimelineGame(timelineGame("one"));
    expect(readSavedTimelineGame("one")?.positions).toEqual(["a", null]);
    expect(readSavedTimelineGames()).toHaveLength(1);
    expect(readSavedTimelineGame("missing")).toBeNull();
  });

  it("rejects invalid progress envelopes and game records", () => {
    const storage = installWindow();
    storage.setItem("aaidle:timeline-progress:v1", JSON.stringify({ version: 2, games: {} }));
    expect(readSavedTimelineGames()).toEqual([]);
    storage.setItem(
      "aaidle:timeline-progress:v1",
      JSON.stringify({ version: 1, games: { bad: { challengeId: "other", positions: [], acceptedAttempts: 0 } } }),
    );
    expect(readSavedTimelineGame("bad")).toBeNull();
    expect(readSavedTimelineGames()).toHaveLength(1);
  });
});
