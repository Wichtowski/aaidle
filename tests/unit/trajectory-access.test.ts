import { describe, expect, it } from "vitest";
import {
  createTrajectoryAccessToken,
  hasTrajectoryAccess,
} from "../../lib/domain/games/classic/trajectory-access";

describe("trajectory access", () => {
  const access = { challengeId: "challenge-1", answerModelId: "answer-1" };

  it("accepts the completion proof for its challenge and answer", () => {
    expect(hasTrajectoryAccess(createTrajectoryAccessToken(access), access)).toBe(true);
  });

  it("rejects a proof for a different challenge or answer", () => {
    const token = createTrajectoryAccessToken(access);

    expect(hasTrajectoryAccess(token, { ...access, challengeId: "challenge-2" })).toBe(false);
    expect(hasTrajectoryAccess(token, { ...access, answerModelId: "answer-2" })).toBe(false);
  });
});
