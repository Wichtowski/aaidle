import { describe, expect, it } from "vitest";
import { modelSpaceAxes, modelSpacePoint } from "../../src/lib/domain/models/model-space";
import type { ClassicCategory, ComparableModel } from "../../src/lib/domain/models/model-types";

const model = (id: string, releaseYear: number, contextWindowTokens: number): ComparableModel => ({
  id,
  name: id,
  provider: "Example",
  country: null,
  family: ["Example"],
  categories: ["example"],
  inputModalities: ["image"],
  outputModalities: ["image"],
  useCases: ["example"],
  reasoningSupport: "no",
  weightAvailability: "not-applicable",
  releaseYear,
  releaseDate: `${releaseYear}-01-01`,
  contextWindowTokens,
  categoryDetails: {
    filters: {
      operationTypes: ["erosion"],
      kernelBased: true,
      kernelSizes: ["3x3"],
      linearity: "non-linear",
      requiresTraining: false,
      outputTypes: ["binary-mask"],
      frameworks: ["opencv"],
    },
  },
});

describe("model-space axes", () => {
  it("uses a meaningful three-axis view for every Classic category", () => {
    const categories: ClassicCategory[] = [
      "llm",
      "cv",
      "nlp",
      "object-detection",
      "classical-ml",
      "filters",
      "hardcore",
    ];

    for (const category of categories) {
      expect(modelSpaceAxes(category)).toHaveLength(3);
    }

    expect(modelSpaceAxes("filters").map((axis) => axis.label)).toEqual([
      "Release year",
      "Kernel scale",
      "Operation & output breadth",
    ]);
  });

  it("normalizes each model against the eligible candidate pool", () => {
    const early = model("early", 2015, 4_000);
    const recent = model("recent", 2025, 128_000);

    expect(modelSpacePoint(early, "llm", [early, recent]).x).toBe(-1);
    expect(modelSpacePoint(recent, "llm", [early, recent]).x).toBe(1);
    expect(modelSpacePoint(early, "llm", [early, recent]).y).toBe(-1);
    expect(modelSpacePoint(recent, "llm", [early, recent]).y).toBe(1);
  });
});
