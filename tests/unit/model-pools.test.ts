import { describe, expect, it } from "vitest";
import rawModels from "../../data/models.seed.json";
import { classicColumnsByCategory } from "../../lib/domain/guesses/comparison-types";
import { focusedClassicCategories } from "../../lib/domain/models/model-types";
import {
  eligibleModelIdsByDifficulty,
  eligibleModelIdsForClassic,
  isModelEligibleForDifficulty,
  catalogModel,
  publicModelIndexByDifficulty,
} from "../../lib/server/model-catalog";

const expectedPoolSize = (rank: number) => rawModels.filter((model) => model.minPool <= rank).length;

describe("Classic model pools", () => {
  it("is nested from Normal through Hardcore", () => {
    const normal = new Set(eligibleModelIdsByDifficulty.normal);
    const challenge = new Set(eligibleModelIdsByDifficulty.challenge);
    const hardcore = new Set(eligibleModelIdsByDifficulty.hardcore);

    expect([...normal].every((id) => challenge.has(id))).toBe(true);
    expect([...challenge].every((id) => hardcore.has(id))).toBe(true);
    expect(eligibleModelIdsByDifficulty.normal).toHaveLength(expectedPoolSize(0));
    expect(eligibleModelIdsByDifficulty.challenge).toHaveLength(expectedPoolSize(1));
    expect(eligibleModelIdsByDifficulty.hardcore).toHaveLength(expectedPoolSize(2));
  });

  it("only exposes the selected pool to model search", () => {
    expect(publicModelIndexByDifficulty.normal).toHaveLength(expectedPoolSize(0));
    expect(publicModelIndexByDifficulty.challenge).toHaveLength(expectedPoolSize(1));
    expect(publicModelIndexByDifficulty.hardcore).toHaveLength(expectedPoolSize(2));
  });

  it("builds non-empty category pools from catalogue categories", () => {
    expect(eligibleModelIdsForClassic("llm", "normal")).not.toHaveLength(0);
    expect(eligibleModelIdsForClassic("cv", "challenge")).not.toHaveLength(0);
    expect(eligibleModelIdsForClassic("classical-ml", "normal")).not.toHaveLength(0);
    expect(eligibleModelIdsForClassic("filters", "normal")).toContain("canny-edge-detector");
    expect(eligibleModelIdsForClassic("filters", "challenge")).toContain("grabcut");
    expect(eligibleModelIdsForClassic("object-detection", "normal")).not.toHaveLength(0);
    expect(eligibleModelIdsForClassic("hardcore", "hardcore")).toHaveLength(expectedPoolSize(2));
    expect(eligibleModelIdsForClassic("hardcore", "hardcore")).toEqual(
      expect.arrayContaining(["canny-edge-detector", "conditional-random-field"]),
    );
  });

  it("keeps weight availability off the Image Processing board", () => {
    expect(classicColumnsByCategory.filters).not.toContain("weightAvailability");
    expect(classicColumnsByCategory.filters).toEqual([
      "provider",
      "country",
      "family",
      "release",
      "operationTypes",
      "kernelBased",
      "linearity",
      "outputModalities",
    ]);
  });

  it("makes Image Processing the sixth category needed to unlock Hardcore", () => {
    expect(focusedClassicCategories).toHaveLength(6);
    expect(focusedClassicCategories).toContain("filters");
  });

  it("includes Normal-ranked GPT language models in the Normal LLM pool", () => {
    const normalLlmIds = eligibleModelIdsForClassic("llm", "normal");

    expect(normalLlmIds).toEqual(
      expect.arrayContaining(["gpt-3-5-turbo", "gpt-4", "gpt-4o", "gpt-5", "gpt-5-6-terra"]),
    );
  });

  it("normalizes absent LLM tool calling metadata to No", () => {
    expect(catalogModel("gpt-4o")?.categoryDetails?.["language-model"]?.toolUse).toBe(false);
    expect(catalogModel("claude-3-7-sonnet")?.categoryDetails?.["language-model"]?.toolUse).toBe(true);
  });

  it("does not allow a model from a harder pool to be guessed in an easier mode", () => {
    const challengeOnlyId = eligibleModelIdsByDifficulty.challenge.find(
      (id) => !eligibleModelIdsByDifficulty.normal.includes(id),
    );

    expect(challengeOnlyId).toBeDefined();
    expect(isModelEligibleForDifficulty(challengeOnlyId!, "normal")).toBe(false);
    expect(isModelEligibleForDifficulty(challengeOnlyId!, "challenge")).toBe(true);
  });
});
