export const timelineDifficulties = ["normal", "challenge", "speedrun", "hardcore"] as const;
export type TimelineDifficulty = (typeof timelineDifficulties)[number];

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
    speedrunStartedAt?: number | null;
    latestAttempt: {
      modelOrder: string[];
      placements: Array<0 | 1 | 2>;
      attemptNumber: number;
      speedrunTimeMs?: number;
    } | null;
  };
};

export type TimelineAttemptPayload = {
  placements: Array<0 | 1 | 2>;
  attemptsRemaining: number | null;
  revealedModels?: TimelineModel[];
  speedrunTimeMs?: number;
};

export type TimelineSpeedrunStartPayload = {
  startedAt: number;
};

export type TimelineLeaderboardPayload = {
  challengeDate: string;
  entries: Array<{
    rank: number;
    displayName: string;
    isCurrentUser: boolean;
    submissions: number;
    timeMs: number;
  }>;
};

export type TimelineGlobalRunPoint = {
  date: string;
  submissions: number;
  timeMs: number;
};

export type TimelineGlobalLeaderboardEntry = {
  rank: number;
  displayName: string;
  isCurrentUser: boolean;
  completedSpeedruns: number;
  averageTimeMs: number;
  averageSubmissions: number;
  fastestTimeMs: number;
  recentRuns: TimelineGlobalRunPoint[];
};

export type TimelineGlobalLeaderboardPayload = {
  fastest: TimelineGlobalLeaderboardEntry[];
  average: TimelineGlobalLeaderboardEntry[];
  completions: TimelineGlobalLeaderboardEntry[];
};

export const timelineLeaderboardPath = (date: string) =>
  `/timeline/leaderboard/${date.replaceAll("-", "")}`;

export const timelineDifficultyLabel = (difficulty: TimelineDifficulty) =>
  difficulty[0]!.toUpperCase() + difficulty.slice(1);
