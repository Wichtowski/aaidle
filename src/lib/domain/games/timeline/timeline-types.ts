export const timelineDifficulties = ["normal", "challenge", "hardcore"] as const;
export type TimelineDifficulty = (typeof timelineDifficulties)[number];

export type TimelineModel = {
  id: string;
  name: string;
  itemKind: "model" | "event";
  releaseDate?: string;
};

export type TimelineAnchor = TimelineModel & {
  releaseDate: string;
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
      placements: Array<0 | 1>;
      attemptNumber: number;
    } | null;
  };
};

export type TimelineAttemptPayload = {
  placements: Array<0 | 1>;
  attemptsRemaining: number | null;
};

export const timelineDifficultyLabel = (difficulty: TimelineDifficulty) =>
  difficulty[0]!.toUpperCase() + difficulty.slice(1);
