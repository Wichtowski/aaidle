// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { GuessRow } from "../../app/components/game/GuessRow";
import type { ClassicComparison } from "../../lib/domain/guesses/comparison-types";
import { classicColumns, classicColumnsByCategory } from "../../lib/domain/guesses/comparison-types";
import type { ComparableModel } from "../../lib/domain/models/model-types";

const model: ComparableModel = {
  id: "example-model",
  name: "Example model",
  provider: "Example AI",
  country: "Poland",
  family: "Example",
  categories: ["Chat", "Coding"],
  inputModalities: ["Text"],
  outputModalities: ["Text"],
  useCases: ["Writing", "Coding"],
  reasoningSupport: "optional",
  weightAvailability: "closed",
  releaseYear: 2026,
  releaseDate: "2026-01-01",
  contextWindowTokens: 128_000,
};

const comparison: ClassicComparison = {
  provider: "correct",
  country: "incorrect",
  family: "incorrect",
  categories: "partial",
  inputModalities: "partial",
  outputModalities: "partial",
  useCases: "partial",
  reasoningSupport: "incorrect",
  openWeights: "incorrect",
  localExecution: "incorrect",
  release: "higher",
  contextWindowTokens: "unknown",
  toolUse: "correct",
};

const hardcoreExcludedColumns = [
  "provider",
  "country",
  "family",
  "reasoningSupport",
  "visionTasks",
  "license",
  "detectionTypes",
  "realTimeCapable",
  "algorithmTypes",
  "learningParadigms",
  "objectives",
  "featureTypes",
  "frameworks",
  "operationTypes",
  "kernelBased",
  "kernelSizes",
  "linearity",
  "outputTypes",
];

describe("Hardcore GuessRow", () => {
  it("excludes only the specified Hardcore clues", () => {
    for (const column of hardcoreExcludedColumns) {
      expect(classicColumnsByCategory.hardcore).not.toContain(column);
    }
  });

  it("includes every category-specific clue column", () => {
    expect(classicColumnsByCategory.hardcore).toEqual(
      classicColumns.filter((column) => !hardcoreExcludedColumns.includes(column)),
    );
  });

  it("only renders green or red clues without highlighted overlaps", () => {
    const { container } = render(
      createElement(GuessRow, {
        model,
        comparison,
        matchingCategories: ["Chat"],
        matchingInputModalities: ["Text"],
        matchingOutputModalities: ["Text"],
        matchingUseCases: ["Coding"],
        rowIndex: 0,
        revealed: true,
        animate: false,
        showCards: true,
        hardcore: true,
        columns: classicColumnsByCategory.hardcore,
      }),
    );

    expect(container.querySelectorAll(".comparison--correct, .comparison--incorrect")).toHaveLength(
      classicColumnsByCategory.hardcore.length,
    );
    expect(container.querySelector(".comparison--partial, .comparison--higher, .comparison--unknown")).toBeNull();
    expect(container.querySelector(".matched-value")).toBeNull();
    const categoryColumn = classicColumnsByCategory.hardcore.indexOf("categories");
    const categoryCardText = container.querySelectorAll(".comparison-card__value")[categoryColumn]?.textContent;
    expect(categoryCardText).toBe("Chat, Coding");
    expect(
      container.querySelectorAll(".comparison-card__value")[categoryColumn]?.getAttribute("data-tooltip"),
    ).toBe(
      "Chat, Coding",
    );

    const toolUseColumn = classicColumnsByCategory.hardcore.indexOf("toolUse");
    const toolUseCard = container.querySelectorAll(".comparison-card")[toolUseColumn];
    expect(toolUseCard?.querySelector(".comparison--correct .comparison-card__value")?.textContent).toBe(
      "N/A",
    );
  });

  it("reserves overlap emphasis for partial matches in Normal only", () => {
    const props = {
      model,
      comparison,
      matchingCategories: ["Chat"],
      matchingInputModalities: ["Text"],
      matchingOutputModalities: ["Text"],
      matchingUseCases: ["Coding"],
      rowIndex: 0,
      revealed: true,
      animate: false,
      showCards: true,
      hardcore: false,
      columns: ["inputModalities"] as const,
    };
    const { container, rerender } = render(createElement(GuessRow, { ...props, difficulty: "normal" }));

    expect(container.querySelector(".matched-value")?.textContent).toBe("Text");

    rerender(createElement(GuessRow, { ...props, difficulty: "challenge" }));

    expect(container.querySelector(".matched-value")).toBeNull();

    rerender(
      createElement(GuessRow, {
        ...props,
        comparison: { ...comparison, inputModalities: "correct" },
        difficulty: "normal",
      }),
    );

    expect(container.querySelector(".matched-value")).toBeNull();
  });

  it("shows a full-value tooltip for long use-case clues", () => {
    const useCases = [
      "semantic-segmentation",
      "referring-image-segmentation",
      "zero-shot-segmentation",
    ];
    const { container } = render(
      createElement(GuessRow, {
        model: { ...model, useCases },
        comparison,
        matchingCategories: [],
        matchingInputModalities: [],
        matchingOutputModalities: [],
        matchingUseCases: [],
        rowIndex: 0,
        revealed: true,
        animate: false,
        showCards: true,
        hardcore: false,
        columns: ["useCases"],
      }),
    );

    expect(container.querySelector(".comparison-card__value")?.getAttribute("data-tooltip")).toBe(
      useCases.join(", "),
    );
  });
});
