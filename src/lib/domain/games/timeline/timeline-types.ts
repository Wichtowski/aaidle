import { difficulties, type Difficulty } from "../../difficulty";

export const timelineDifficulties = difficulties;
export type TimelineDifficulty = Difficulty;

export type TimelineModel = {
  id: string;
  name: string;
  itemKind: "model" | "event";
  categories?: string[];
  releaseDate?: string;
  yearAnnotation?: string;
};

export type TimelineAnchor = TimelineModel & {
  releaseDate: string;
  yearAnnotation?: string;
};

export type TimelineGamePayload = {
  challenge: {
    id: string;
    date: string;
    difficulty: TimelineDifficulty;
    expiresAt: string;
  };
  slots: Array<{
    position: number;
    anchor: TimelineAnchor | null;
  }>;
  movableModels: TimelineModel[];
  progress: {
    solved: boolean;
    attemptLimit: number | null;
    attemptsRemaining: number | null;
    latestAttempt: {
      modelOrder: string[];
      placements: Array<0 | 1 | 2>;
      attemptNumber: number;
    } | null;
  };
};

export type TimelineAttemptPayload = {
  placements: Array<0 | 1 | 2>;
  attemptsRemaining: number | null;
  revealedModels?: TimelineModel[];
};

export const timelineDifficultyLabel = (difficulty: TimelineDifficulty) =>
  difficulty[0]!.toUpperCase() + difficulty.slice(1);
