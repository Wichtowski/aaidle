export const challengeModes = [
  "classic",
  "provider",
  "emoji",
  "logo",
  "model-card",
  "output",
  "timeline",
] as const;
export type ChallengeMode = (typeof challengeModes)[number];
export type ClassicMode = "classic";
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
