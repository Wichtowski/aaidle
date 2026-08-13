// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { CompletionTrajectory } from "../../app/components/game/CompletionTrajectory";
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
  it("shows the path to the solved model", () => {
    const answer = model("answer", "Answer model");
    render(
      createElement(CompletionTrajectory, {
        answer,
        guesses: [{ attemptNumber: 1, model: model("guess", "First guess") }],
      }),
    );

    expect(screen.getByRole("heading", { name: "Your trajectory" })).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "Three-dimensional guess trajectory toward Answer model",
      }),
    ).toBeTruthy();
  });
});
