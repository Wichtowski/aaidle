// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { GuessRow } from "../../app/components/game/GuessRow";
import type { ClassicComparison } from "../../lib/domain/guesses/comparison-types";
import { classicColumnsByCategory } from "../../lib/domain/guesses/comparison-types";
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
};

describe("Hardcore GuessRow", () => {
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

    expect(container.querySelectorAll(".comparison--correct, .comparison--incorrect")).toHaveLength(8);
    expect(container.querySelector(".comparison--partial, .comparison--higher, .comparison--unknown")).toBeNull();
    expect(container.querySelector(".matched-value")).toBeNull();
  });
});
