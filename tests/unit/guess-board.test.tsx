// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { GuessBoard } from "../../src/app/components/game/GuessBoard";
import type { ClassicComparison } from "../../src/lib/domain/guesses/comparison-types";
import type { ComparableModel } from "../../src/lib/domain/models/model-types";

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
  release: "lower",
  contextWindowTokens: "higher",
};

const model = (index: number): ComparableModel => ({
  id: `model-${index}`,
  name: `Model ${index}`,
  provider: "Example AI",
  country: "Poland",
  family: ["Example"],
  categories: ["Chat"],
  inputModalities: ["Text"],
  outputModalities: ["Text"],
  useCases: ["Writing"],
  reasoningSupport: "optional",
  weightAvailability: "closed",
  releaseYear: 2026,
  releaseDate: "2026-01-01",
  contextWindowTokens: 128_000,
});

describe("GuessBoard", () => {
  it("shows one centered loading spinner while a new guess is being checked", () => {
    render(
      createElement(GuessBoard, {
        guesses: [
          {
            requestId: "pending-guess",
            model: model(1),
            comparison,
            matchingCategories: [],
            matchingInputModalities: [],
            matchingOutputModalities: [],
            matchingUseCases: [],
            revealed: false,
            animate: false,
            showCards: false,
          },
        ],
      }),
    );

    expect(screen.getByRole("status", { name: "Loading comparison cards" })).toBeTruthy();
    expect(document.querySelectorAll(".guess-row__spinner")).toHaveLength(1);
  });

  it("uses clue columns suited to the selected category", () => {
    const { container } = render(
      createElement(GuessBoard, {
        category: "object-detection",
        guesses: [],
      }),
    );
    const board = within(container);

    expect(board.getByRole("columnheader", { name: "Release" })).toBeTruthy();
    expect(board.queryByRole("columnheader", { name: "Context" })).toBeNull();
    expect(board.queryByRole("columnheader", { name: "Categories" })).toBeNull();
    expect(board.queryByRole("columnheader", { name: "Reasoning" })).toBeNull();
  });

  it("keeps Country for Normal but removes it from Challenge and Hardcore", () => {
    const { container, rerender } = render(
      createElement(GuessBoard, { category: "llm", difficulty: "normal", guesses: [] }),
    );

    expect(within(container).getByRole("columnheader", { name: "Country" })).toBeTruthy();

    rerender(createElement(GuessBoard, { category: "llm", difficulty: "challenge", guesses: [] }));
    expect(within(container).queryByRole("columnheader", { name: "Country" })).toBeNull();

    rerender(
      createElement(GuessBoard, { category: "hardcore", difficulty: "hardcore", guesses: [] }),
    );
    expect(within(container).queryByRole("columnheader", { name: "Country" })).toBeNull();
  });

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
