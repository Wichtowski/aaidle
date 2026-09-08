import { describe, expect, it } from "vitest";
import {
  canonicalClassicChallengeMode,
  classicCategoryFromRouteSegment,
  classicChallengeMode,
  classicModeFromChallengeMode,
  isClassicCategory,
  isClassicDifficulty,
} from "../../../src/lib/domain/models/model-types";
import {
  COMMON_FIELDS,
  FOCUSED_CATEGORY,
  GAME_MODE,
  getBoardFields,
  HARDCORE_FIELDS,
  isEligibleForPool,
} from "../../../src/lib/domain/guesses/model-game-fields";

describe("classic category and challenge mode helpers", () => {
  it.each([
    ["llm", "llm"],
    ["image-processing", "filters"],
    ["od", "object-detection"],
    ["classical-ml", "classical-ml"],
  ])("maps route segment %s to %s", (segment, category) => {
    expect(classicCategoryFromRouteSegment(segment)).toBe(category);
  });

  it("returns undefined for missing and unknown route segments", () => {
    expect(classicCategoryFromRouteSegment(undefined)).toBeUndefined();
    expect(classicCategoryFromRouteSegment(null)).toBeUndefined();
    expect(classicCategoryFromRouteSegment("unknown")).toBeUndefined();
  });

  it("recognizes only supported categories and difficulties", () => {
    expect(isClassicCategory("hardcore")).toBe(true);
    expect(isClassicCategory("not-a-category")).toBe(false);
    expect(isClassicCategory(undefined)).toBe(false);
    expect(isClassicDifficulty("challenge")).toBe(true);
    expect(isClassicDifficulty("speedrun")).toBe(false);
  });

  it("round-trips every challenge mode", () => {
    for (const category of [
      "llm",
      "cv",
      "nlp",
      "object-detection",
      "classical-ml",
      "filters",
      "hardcore",
    ] as const) {
      const mode = classicChallengeMode(category, "challenge");
      expect(classicModeFromChallengeMode(mode)).toEqual({ category, difficulty: "challenge" });
      expect(canonicalClassicChallengeMode(mode)).toBe(mode);
    }
  });

  it("canonicalizes legacy category segments", () => {
    expect(canonicalClassicChallengeMode("classic:object-detection:normal")).toBe(
      "classic:od:normal",
    );
    expect(canonicalClassicChallengeMode("classic:image-processing:hardcore")).toBe(
      "classic:filters:hardcore",
    );
  });

  it("rejects malformed challenge modes", () => {
    expect(canonicalClassicChallengeMode("classic:unknown:normal")).toBeNull();
    expect(() => classicModeFromChallengeMode("classic:llm:speedrun")).toThrow(
      "Invalid Classic challenge mode",
    );
  });
});

describe("classic board field selection", () => {
  it("keeps the complete focused category board for Normal", () => {
    const fields = getBoardFields(GAME_MODE.NORMAL, FOCUSED_CATEGORY.LANGUAGE_MODEL);
    expect(fields).toContain("country");
    expect(fields).toContain("reasoningSupport");
    expect(fields).toContain("contextWindowTokens");
  });

  it("removes country from Challenge without changing other fields", () => {
    const normal = getBoardFields(GAME_MODE.NORMAL, FOCUSED_CATEGORY.COMPUTER_VISION);
    const challenge = getBoardFields(GAME_MODE.CHALLENGE, FOCUSED_CATEGORY.COMPUTER_VISION);
    expect(challenge).not.toContain("country");
    expect(challenge).toEqual(normal.filter((field) => field !== "country"));
  });

  it("uses the same category-independent fields for Hardcore", () => {
    for (const category of Object.values(FOCUSED_CATEGORY)) {
      expect(getBoardFields(GAME_MODE.HARDCORE, category)).toEqual(HARDCORE_FIELDS);
      expect(getBoardFields(GAME_MODE.HARDCORE, category)).not.toContain("country");
    }
  });

  it("exposes the expected common fields and pool boundary behavior", () => {
    expect(COMMON_FIELDS).toContain("releaseDate");
    expect(isEligibleForPool({ minPool: 0 }, 0)).toBe(true);
    expect(isEligibleForPool({ minPool: 2 }, 1)).toBe(false);
    expect(isEligibleForPool({ minPool: 2 }, 2)).toBe(true);
  });
});
