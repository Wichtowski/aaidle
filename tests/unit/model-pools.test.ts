import { describe, expect, it } from "vitest";
import rawModels from "../../data/models.seed.json";
import { classicColumnsByCategory } from "../../lib/domain/guesses/comparison-types";
import { compareClassicModels } from "../../lib/domain/guesses/comparison-engine";
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
      "kernelSizes",
      "linearity",
      "requiresTraining",
      "outputTypes",
      "frameworks",
      "outputModalities",
    ]);
  });

  it("distinguishes morphological operations that otherwise share every Filters clue", () => {
    const erosion = catalogModel("erosion");
    const dilation = catalogModel("dilation");
    const topHat = catalogModel("top-hat");
    const blackHat = catalogModel("black-hat");

    expect(erosion?.categoryDetails?.filters?.operationTypes).toEqual(["morphology", "erosion"]);
    expect(dilation?.categoryDetails?.filters?.operationTypes).toEqual(["morphology", "dilation"]);
    expect(compareClassicModels(erosion!, dilation!).operationTypes).toBe("partial");
    expect(compareClassicModels(topHat!, blackHat!).operationTypes).toBe("partial");
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

  it("replaces placeholder language metadata with conservative coverage estimates", () => {
    expect(catalogModel("gpt-5")?.categoryDetails?.["language-model"]?.supportedLanguages).toEqual(
      expect.arrayContaining(["english", "spanish", "chinese"]),
    );
    expect(catalogModel("deepseek-v3")?.categoryDetails?.["language-model"]?.supportedLanguages).toEqual(
      expect.arrayContaining(["english", "chinese"]),
    );
    expect(catalogModel("text-embedding-3-large")?.categoryDetails?.nlp?.supportedLanguages).toEqual(
      expect.arrayContaining(["english", "french", "japanese"]),
    );
  });

  it("exposes non-placeholder language coverage for every LLM and NLP model", () => {
    for (const model of rawModels) {
      const seededLanguages =
        model.categoryDetails?.["language-model"]?.supportedLanguages ??
        model.categoryDetails?.nlp?.supportedLanguages;

      if (!seededLanguages) continue;

      const catalogLanguages =
        catalogModel(model.id)?.categoryDetails?.["language-model"]?.supportedLanguages ??
        catalogModel(model.id)?.categoryDetails?.nlp?.supportedLanguages;

      expect(catalogLanguages, model.id).toBeDefined();
      expect(catalogLanguages, model.id).not.toHaveLength(0);
      expect(catalogLanguages, model.id).not.toEqual(["unknown"]);
    }
  });

  it("preserves documented, model-specific language lists", () => {
    expect(catalogModel("bielik-11b-v3-0-instruct")?.categoryDetails?.["language-model"]?.supportedLanguages).toEqual([
      "polish",
    ]);
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
