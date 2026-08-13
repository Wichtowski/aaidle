import { describe, expect, it } from "vitest";
import { publicChallenge } from "../../lib/domain/challenges/challenge-service";

describe("publicChallenge", () => {
  it("never exposes the answer model identifier", () => {
    const response = publicChallenge({
      id: "challenge-1",
      challengeDate: "2026-08-11",
      mode: "classic:llm:normal",
      answerModelId: "secret-answer-model-id",
      selectionVersion: 1,
      generatedAt: 0,
      generationSource: "lazy",
    });

    expect(response).not.toHaveProperty("answerModelId");
    expect(JSON.stringify(response)).not.toContain("secret-answer-model-id");
  });
});
