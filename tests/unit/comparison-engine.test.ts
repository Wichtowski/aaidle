import { describe, it, expect } from "vitest";
import {
  compareClassicModels,
  compareNullableBoolean,
  compareSets,
} from "../../lib/domain/guesses/comparison-engine";
import type { ComparableModel } from "../../lib/domain/models/model-types";
const base: ComparableModel = {
  id: "a",
  name: "A",
  provider: "OpenAI",
  country: "US",
  family: "GPT",
  categories: ["Language Model", "Coding"],
  inputModalities: ["Text"],
  outputModalities: ["Text"],
  useCases: ["Coding"],
  reasoningSupport: "no",
  weightAvailability: "closed",
  releaseYear: 2024,
  releaseDate: "2024-05-13",
  contextWindowTokens: 128000,
};
describe("comparison engine", () => {
  it("normalizes identical unordered sets", () =>
    expect(compareSets(["Coding", "Language Model"], ["language-model", "coding"])).toBe(
      "correct",
    ));
  it("returns partial and unknown correctly", () => {
    expect(compareSets(["coding"], ["coding", "vision"])).toBe("partial");
    expect(compareSets(null, ["coding"])).toBe("unknown");
  });
  it("compares nullable booleans", () => {
    expect(compareNullableBoolean(false, false)).toBe("correct");
    expect(compareNullableBoolean(null, false)).toBe("unknown");
  });
  it("reports release direction by year and quarter", () => {
    const answer = { ...base, id: "b", releaseYear: 2024, releaseDate: "2024-10-01", contextWindowTokens: 64000 };
    const result = compareClassicModels(base, answer);
    expect(result.release).toBe("higher");
    expect(result.contextWindowTokens).toBe("lower");
  });
  it("reports scalar mismatch", () =>
    expect(compareClassicModels(base, { ...base, id: "b", provider: "Anthropic" }).provider).toBe(
      "incorrect",
    ));
});
