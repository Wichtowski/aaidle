export type ScalarComparison = "correct" | "incorrect" | "unknown";
export type SetComparison = "correct" | "partial" | "incorrect" | "unknown";
export type NumberComparison = "correct" | "higher" | "lower" | "unknown";
export type ClassicComparison = {
  provider: ScalarComparison;
  country: ScalarComparison;
  family: ScalarComparison;
  categories: SetComparison;
  inputModalities: SetComparison;
  outputModalities: SetComparison;
  useCases: SetComparison;
  reasoningSupport: ScalarComparison;
  openWeights: ScalarComparison;
  localExecution: ScalarComparison;
  releaseYear: NumberComparison;
  contextWindowTokens: NumberComparison;
};
export const classicColumns = [
  "provider",
  "country",
  "family",
  "categories",
  "inputModalities",
  "outputModalities",
  "useCases",
  "reasoningSupport",
  "openWeights",
  "localExecution",
  "releaseYear",
  "contextWindowTokens",
] as const;
export type ClassicColumn = (typeof classicColumns)[number];
