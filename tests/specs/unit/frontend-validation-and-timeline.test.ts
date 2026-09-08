import { describe, expect, it } from "vitest";
import { normalizeModelSearch } from "../../../src/lib/domain/models/model-normalizer";
import { timelineCategoryLabel } from "../../../src/lib/domain/games/timeline/timeline-category";
import {
  timelineDifficultyLabel,
  timelineLeaderboardPath,
} from "../../../src/lib/domain/games/timeline/timeline-types";
import {
  dateSchema,
  emojiGuessRequestSchema,
  guessRequestSchema,
  logoProgressSchema,
  parseEmojiGuess,
  parseJson,
} from "../../../src/lib/validation/api";

describe("model search normalization", () => {
  it.each([
    ["GPT–4o", "gpt4o"],
    ["Claude — 3.5 Sonnet", "claude35sonnet"],
    ["  Llama_3.1! ", "llama31"],
    ["MIXED.Case/Name", "mixedcasename"],
  ])("normalizes %s", (value, expected) => {
    expect(normalizeModelSearch(value)).toBe(expected);
  });
});

describe("timeline labels and paths", () => {
  it("prefers the first recognized category", () => {
    expect(timelineCategoryLabel(["unknown", "computer-vision", "nlp"], "model")).toBe("CV");
    expect(timelineCategoryLabel(["language-model"], "event")).toBe("LLM");
  });

  it("falls back to a capitalized item kind", () => {
    expect(timelineCategoryLabel(undefined, "event")).toBe("Event");
    expect(timelineCategoryLabel([], "milestone")).toBe("Milestone");
  });

  it.each([
    ["normal", "Normal"],
    ["challenge", "Challenge"],
    ["speedrun", "Speedrun"],
    ["hardcore", "Hardcore"],
  ] as const)("labels %s", (difficulty, label) => {
    expect(timelineDifficultyLabel(difficulty)).toBe(label);
  });

  it("removes hyphens from leaderboard dates", () => {
    expect(timelineLeaderboardPath("2025-03-09")).toBe("/timeline/leaderboard/20250309");
  });
});

describe("API request validation", () => {
  it("accepts valid classic and emoji guesses", () => {
    expect(guessRequestSchema.parse({ guessedModelId: "model-1", attemptNumber: 1 })).toEqual({
      guessedModelId: "model-1",
      attemptNumber: 1,
    });
    expect(
      emojiGuessRequestSchema.parse({ guessedFamilyId: "family-1", attemptNumber: 2 }),
    ).toEqual({
      guessedFamilyId: "family-1",
      attemptNumber: 2,
    });
  });

  it.each([
    { guessedModelId: "", attemptNumber: 1 },
    { guessedModelId: "model", attemptNumber: 0 },
    { guessedModelId: "model", attemptNumber: 1.5 },
    { guessedModelId: "model", attemptNumber: 65_536 },
  ])("rejects invalid classic guess %#", (input) => {
    expect(() => guessRequestSchema.parse(input)).toThrow();
  });

  it("parses bounded JSON request bodies", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ guessedModelId: "model", attemptNumber: 3 }),
    });
    await expect(parseJson(request)).resolves.toEqual({
      guessedModelId: "model",
      attemptNumber: 3,
    });
    const emojiRequest = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ guessedFamilyId: "family", attemptNumber: 1 }),
    });
    await expect(parseEmojiGuess(emojiRequest)).resolves.toEqual({
      guessedFamilyId: "family",
      attemptNumber: 1,
    });
  });

  it("rejects malformed JSON request bodies", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "not-json" });
    await expect(parseJson(request)).rejects.toThrow();
  });

  it("validates ISO dates and each logo reveal profile", () => {
    expect(dateSchema.parse("2025-01-31")).toBe("2025-01-31");
    expect(() => dateSchema.parse("31-01-2025")).toThrow();
    const base = {
      imageUrl: "https://example.test/logo.png",
      imageRevision: 1,
      maximumImageRevision: 3,
      clues: [],
      solved: false,
    };
    expect(logoProgressSchema.parse({ ...base, revealProfile: null }).revealProfile).toBeNull();
    expect(
      logoProgressSchema.parse({
        ...base,
        revealProfile: "progressive-zoom",
        focalPoint: { x: 0, y: 512 },
      }),
    ).toMatchObject({ revealProfile: "progressive-zoom" });
    expect(
      logoProgressSchema.parse({
        ...base,
        revealProfile: "gaussian-blur",
        blurStartStrength: 1,
        blurStepStrength: 2,
      }),
    ).toMatchObject({ revealProfile: "gaussian-blur" });
    expect(() =>
      logoProgressSchema.parse({
        ...base,
        revealProfile: "gaussian-blur",
        blurStartStrength: 0,
        blurStepStrength: 2,
      }),
    ).toThrow();
  });
});
