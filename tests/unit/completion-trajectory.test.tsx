// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { CompletionTrajectory } from "../../app/components/game/CompletionTrajectory";
import { ModelSpaceTrajectory } from "../../app/components/game/ModelSpaceTrajectory";
import type { ClassicComparison } from "../../lib/domain/guesses/comparison-types";
import type { ComparableModel } from "../../lib/domain/models/model-types";

const model = (id: string, name: string): ComparableModel => ({
  id,
  name,
  provider: "Example AI",
  country: "Poland",
  family: "Example",
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

describe("CompletionTrajectory", () => {
  it("shows the player’s clue-alignment path to the winning guess", () => {
    const comparison: ClassicComparison = {
      provider: "correct",
      country: "incorrect",
      family: "incorrect",
      inputModalities: "correct",
      outputModalities: "correct",
      useCases: "partial",
      release: "higher",
      weightAvailability: "incorrect",
      reasoningSupport: "incorrect",
      contextWindowTokens: "lower",
      toolUse: "incorrect",
      multimodal: "incorrect",
    };
    render(
      createElement(CompletionTrajectory, {
        category: "llm",
        difficulty: "normal",
        guesses: [
          { attemptNumber: 1, comparison, isCorrect: false, model: model("guess", "First guess") },
          { attemptNumber: 2, comparison, isCorrect: true, model: model("answer", "Answer model") },
        ],
      }),
    );

    expect(screen.getByRole("heading", { name: "Your guessing trajectory" })).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "Your clue-alignment trajectory across 2 guesses",
      }),
    ).toBeTruthy();
    expect(screen.getByText("final answer: Answer model")).toBeTruthy();
  });

  it("shows the candidate grid with category-specific axes", () => {
    const answer = model("answer", "Answer model");
    render(
      createElement(ModelSpaceTrajectory, {
        category: "filters",
        guesses: [
          { attemptNumber: 1, isCorrect: false, model: model("guess", "First guess") },
          { attemptNumber: 2, isCorrect: true, model: answer },
        ],
        referenceModels: [model("candidate", "Candidate model"), answer],
      }),
    );

    expect(screen.getByRole("heading", { name: "Latest solved-game trajectory" })).toBeTruthy();
    expect(screen.getByText("Kernel scale")).toBeTruthy();
    expect(screen.getByText("1 candidate models")).toBeTruthy();
  });
});
