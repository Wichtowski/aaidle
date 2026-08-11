import type { ChallengeMode } from "../models/model-types";
import type { ClassicColumn } from "../guesses/comparison-types";
export type PublicDailyChallengeDto = {
  id: string;
  date: string;
  mode: "classic";
  expiresAt: string;
  columns: ClassicColumn[];
};
export type DailyChallenge = {
  id: string;
  challengeDate: string;
  mode: ChallengeMode;
  answerModelId: string;
  selectionVersion: number;
  generatedAt: number;
  generationSource: "lazy" | "scheduled" | "manual";
};
export class NoEligibleModelsError extends Error {
  constructor() {
    super("No eligible models are available for today’s challenge.");
  }
}
