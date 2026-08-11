import type { ComparableModel } from "../models/model-types";
import type {
  ClassicComparison,
  NumberComparison,
  ScalarComparison,
  SetComparison,
} from "./comparison-types";

const normalized = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[\s_-]+/g, "-");
export function compareScalar(a: string | null, b: string | null): ScalarComparison {
  return a == null || b == null
    ? "unknown"
    : normalized(a) === normalized(b)
      ? "correct"
      : "incorrect";
}
export function compareNullableBoolean(a: boolean | null, b: boolean | null): ScalarComparison {
  return a == null || b == null ? "unknown" : a === b ? "correct" : "incorrect";
}
export const compareEnum = compareScalar;
export function compareSets(a: string[] | null, b: string[] | null): SetComparison {
  if (!a?.length || !b?.length) return "unknown";
  const left = new Set(a.map(normalized));
  const right = new Set(b.map(normalized));
  if (left.size === right.size && [...left].every((value) => right.has(value))) return "correct";
  return [...left].some((value) => right.has(value)) ? "partial" : "incorrect";
}
export function compareNumber(guess: number | null, answer: number | null): NumberComparison {
  return guess == null || answer == null
    ? "unknown"
    : guess === answer
      ? "correct"
      : answer > guess
        ? "higher"
        : "lower";
}
export const compareYear = compareNumber;
export function compareClassicModels(
  guessed: ComparableModel,
  answer: ComparableModel,
): ClassicComparison {
  return {
    provider: compareScalar(guessed.provider, answer.provider),
    country: compareScalar(guessed.country, answer.country),
    family: compareScalar(guessed.family, answer.family),
    categories: compareSets(guessed.categories, answer.categories),
    inputModalities: compareSets(guessed.inputModalities, answer.inputModalities),
    outputModalities: compareSets(guessed.outputModalities, answer.outputModalities),
    useCases: compareSets(guessed.useCases, answer.useCases),
    reasoningSupport: compareEnum(guessed.reasoningSupport, answer.reasoningSupport),
    openWeights: compareNullableBoolean(guessed.openWeights, answer.openWeights),
    localExecution: compareEnum(guessed.localExecution, answer.localExecution),
    releaseYear: compareYear(guessed.releaseYear, answer.releaseYear),
    contextWindowTokens: compareNumber(guessed.contextWindowTokens, answer.contextWindowTokens),
  };
}
