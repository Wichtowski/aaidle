import { describe, expect, it } from "vitest";
import {
  eligibleModelIdsByDifficulty,
  eligibleModelIdsForClassic,
  isModelEligibleForDifficulty,
  publicModelIndexByDifficulty,
} from "../../lib/server/model-catalog";

describe("Classic model pools", () => {
  it("is nested from Normal through Hardcore", () => {
    const normal = new Set(eligibleModelIdsByDifficulty.normal);
    const challenge = new Set(eligibleModelIdsByDifficulty.challenge);
    const hardcore = new Set(eligibleModelIdsByDifficulty.hardcore);

    expect([...normal].every((id) => challenge.has(id))).toBe(true);
    expect([...challenge].every((id) => hardcore.has(id))).toBe(true);
    expect(eligibleModelIdsByDifficulty.normal).toHaveLength(48);
    expect(eligibleModelIdsByDifficulty.challenge).toHaveLength(150);
    expect(eligibleModelIdsByDifficulty.hardcore).toHaveLength(209);
  });

  it("only exposes the selected pool to model search", () => {
    expect(publicModelIndexByDifficulty.normal).toHaveLength(48);
    expect(publicModelIndexByDifficulty.challenge).toHaveLength(150);
    expect(publicModelIndexByDifficulty.hardcore).toHaveLength(209);
  });

  it("builds non-empty category pools from catalogue categories", () => {
    expect(eligibleModelIdsForClassic("llm", "normal")).not.toHaveLength(0);
    expect(eligibleModelIdsForClassic("cv", "challenge")).not.toHaveLength(0);
    expect(eligibleModelIdsForClassic("classical-ml", "normal")).not.toHaveLength(0);
    expect(eligibleModelIdsForClassic("object-detection", "normal")).not.toHaveLength(0);
    expect(eligibleModelIdsForClassic("hardcore", "hardcore")).toHaveLength(209);
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
