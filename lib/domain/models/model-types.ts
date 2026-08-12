export const classicDifficulties = ["normal", "challenge", "hardcore"] as const;
export type ClassicDifficulty = (typeof classicDifficulties)[number];
export type ModelPoolRank = 0 | 1 | 2;

export function isClassicDifficulty(value: string | null | undefined): value is ClassicDifficulty {
  return classicDifficulties.includes(value as ClassicDifficulty);
}

export const classicDifficultyRank: Record<ClassicDifficulty, ModelPoolRank> = {
  normal: 0,
  challenge: 1,
  hardcore: 2,
};

export const classicChallengeModes = classicDifficulties.map(
  (difficulty) => `classic:${difficulty}` as const,
);
export type ClassicChallengeMode = (typeof classicChallengeModes)[number];

export const challengeModes = [
  ...classicChallengeModes,
  "provider",
  "emoji",
  "logo",
  "model-card",
  "output",
  "timeline",
] as const;
export type ChallengeMode = (typeof challengeModes)[number];

export function classicChallengeMode(difficulty: ClassicDifficulty): ClassicChallengeMode {
  return `classic:${difficulty}`;
}

export function classicDifficultyFromChallengeMode(mode: ClassicChallengeMode): ClassicDifficulty {
  return mode.slice("classic:".length) as ClassicDifficulty;
}
export type LocalExecution = "yes" | "no" | "limited" | "unknown";
export type ReasoningSupport = "native" | "optional" | "no" | "unknown";

export type PublicModelIndex = {
  id: string;
  name: string;
  providerName: string;
  familyName: string;
  aliases: string[];
};
export type ComparableModel = {
  id: string;
  name: string;
  provider: string | null;
  country: string | null;
  family: string | null;
  categories: string[] | null;
  inputModalities: string[] | null;
  outputModalities: string[] | null;
  useCases: string[] | null;
  reasoningSupport: ReasoningSupport | null;
  openWeights: boolean | null;
  localExecution: LocalExecution | null;
  releaseYear: number | null;
  releaseDate: string | null;
  contextWindowTokens: number | null;
};
export type PublicGuessedModel = Required<Pick<ComparableModel, "id" | "name">> &
  Omit<ComparableModel, "id" | "name">;
