// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { GuessBoard } from "../../app/components/game/GuessBoard";
import type { ClassicComparison } from "../../lib/domain/guesses/comparison-types";
import type { ComparableModel } from "../../lib/domain/models/model-types";

const comparison: ClassicComparison = {
  provider: "incorrect",
  country: "incorrect",
  family: "incorrect",
  categories: "incorrect",
  inputModalities: "incorrect",
  outputModalities: "incorrect",
  useCases: "incorrect",
  reasoningSupport: "incorrect",
  openWeights: "incorrect",
  localExecution: "incorrect",
  releaseYear: "lower",
  contextWindowTokens: "higher",
};

const model = (index: number): ComparableModel => ({
  id: `model-${index}`,
  name: `Model ${index}`,
  provider: "Example AI",
  country: "Poland",
  family: "Example",
  categories: ["Chat"],
  inputModalities: ["Text"],
  outputModalities: ["Text"],
  useCases: ["Writing"],
  reasoningSupport: "optional",
  openWeights: false,
  localExecution: "no",
  releaseYear: 2026,
  releaseDate: "2026-01-01",
  contextWindowTokens: 128_000,
});

describe("GuessBoard", () => {
  it("collapses earlier guesses after the fifth guess and lets players reopen them", () => {
    const { rerender } = render(
      createElement(GuessBoard, {
        guesses: Array.from({ length: 6 }, (_, index) => ({
          requestId: `guess-${index + 1}`,
          model: model(index + 1),
          comparison,
          matchingCategories: [],
          matchingInputModalities: [],
          matchingOutputModalities: [],
          matchingUseCases: [],
          revealed: true,
          animate: false,
          showCards: true,
        })),
      }),
    );

    const showFirstGuess = screen.getByRole("button", {
      name: "Show comparison for guess 1: Model 1",
    });

    expect(showFirstGuess.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: /Collapse comparison for guess 6/ })).toBeTruthy();

    fireEvent.click(showFirstGuess);

    expect(screen.getByRole("button", { name: /Collapse comparison for guess 1/ })).toBeTruthy();

    rerender(
      createElement(GuessBoard, {
        guesses: Array.from({ length: 7 }, (_, index) => ({
          requestId: `guess-${index + 1}`,
          model: model(index + 1),
          comparison,
          matchingCategories: [],
          matchingInputModalities: [],
          matchingOutputModalities: [],
          matchingUseCases: [],
          revealed: true,
          animate: false,
          showCards: true,
        })),
      }),
    );

    expect(screen.getByRole("button", { name: /Collapse comparison for guess 1/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Collapse comparison for guess 1/ }));

    expect(
      screen.getByRole("button", { name: "Show comparison for guess 1: Model 1" }),
    ).toBeTruthy();
  });
});
