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
const unknown = (value: string | null) => value != null && normalized(value) === "unknown";
export function compareScalar(a: string | null, b: string | null): ScalarComparison {
  if (a == null || b == null) return "unknown";
  if (unknown(a) || unknown(b)) return unknown(a) && unknown(b) ? "correct" : "unknown";

  return normalized(a) === normalized(b) ? "correct" : "incorrect";
}
export function compareNullableBoolean(a: boolean | null, b: boolean | null): ScalarComparison {
  return a == null || b == null ? "unknown" : a === b ? "correct" : "incorrect";
}
export const compareEnum = compareScalar;
export function compareSets(a: string[] | null, b: string[] | null): SetComparison {
  if (!a?.length || !b?.length) return "unknown";
  if (a.some(unknown) || b.some(unknown)) {
    return a.every(unknown) && b.every(unknown) ? "correct" : "unknown";
  }

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
const releaseQuarter = (model: ComparableModel) => {
  if (!model.releaseDate) return null;
  const year = Number(model.releaseDate.slice(0, 4));
  const month = Number(model.releaseDate.slice(5, 7));
  return Number.isFinite(year) && month >= 1 && month <= 12 ? year * 4 + Math.ceil(month / 3) : null;
};
export function compareClassicModels(
  guessed: ComparableModel,
  answer: ComparableModel,
): ClassicComparison {
  const language = (model: ComparableModel) => model.categoryDetails?.["language-model"];
  const vision = (model: ComparableModel) => model.categoryDetails?.["computer-vision"];
  const nlp = (model: ComparableModel) => model.categoryDetails?.nlp;
  const detection = (model: ComparableModel) => model.categoryDetails?.["object-detection"];
  const classical = (model: ComparableModel) => model.categoryDetails?.["classical-ml"];
  const filters = (model: ComparableModel) => model.categoryDetails?.filters;
  return {
    provider: compareScalar(guessed.provider, answer.provider),
    country: compareScalar(guessed.country, answer.country),
    family: compareScalar(guessed.family, answer.family),
    categories: compareSets(guessed.categories, answer.categories),
    inputModalities: compareSets(guessed.inputModalities, answer.inputModalities),
    outputModalities: compareSets(guessed.outputModalities, answer.outputModalities),
    useCases: compareSets(guessed.useCases, answer.useCases),
    reasoningSupport: compareEnum(guessed.reasoningSupport, answer.reasoningSupport),
    weightAvailability: compareEnum(guessed.weightAvailability, answer.weightAvailability),
    release: compareNumber(releaseQuarter(guessed), releaseQuarter(answer)),
    contextWindowTokens: compareNumber(guessed.contextWindowTokens, answer.contextWindowTokens),
    supportedLanguages: compareSets(language(guessed)?.supportedLanguages ?? nlp(guessed)?.supportedLanguages ?? null, language(answer)?.supportedLanguages ?? nlp(answer)?.supportedLanguages ?? null),
    toolUse: compareNullableBoolean(language(guessed)?.toolUse ?? null, language(answer)?.toolUse ?? null),
    multimodal: compareNullableBoolean(language(guessed)?.multimodal ?? null, language(answer)?.multimodal ?? null),
    visionTasks: compareSets(vision(guessed)?.visionTasks ?? null, vision(answer)?.visionTasks ?? null),
    architecture: compareSets(vision(guessed)?.architecture ?? nlp(guessed)?.architecture ?? detection(guessed)?.architecture ?? null, vision(answer)?.architecture ?? nlp(answer)?.architecture ?? detection(answer)?.architecture ?? null),
    trainingDatasets: compareSets(vision(guessed)?.trainingDatasets ?? nlp(guessed)?.trainingDatasets ?? detection(guessed)?.trainingDatasets ?? null, vision(answer)?.trainingDatasets ?? nlp(answer)?.trainingDatasets ?? detection(answer)?.trainingDatasets ?? null),
    license: compareScalar(vision(guessed)?.license ?? null, vision(answer)?.license ?? null),
    nlpTasks: compareSets(nlp(guessed)?.nlpTasks ?? null, nlp(answer)?.nlpTasks ?? null),
    detectionTypes: compareSets(detection(guessed)?.detectionTypes ?? null, detection(answer)?.detectionTypes ?? null),
    realTimeCapable: compareNullableBoolean(detection(guessed)?.realTimeCapable ?? null, detection(answer)?.realTimeCapable ?? null),
    algorithmTypes: compareSets(classical(guessed)?.algorithmTypes ?? null, classical(answer)?.algorithmTypes ?? null),
    learningParadigms: compareSets(classical(guessed)?.learningParadigms ?? null, classical(answer)?.learningParadigms ?? null),
    objectives: compareSets(classical(guessed)?.objectives ?? null, classical(answer)?.objectives ?? null),
    featureTypes: compareSets(classical(guessed)?.featureTypes ?? null, classical(answer)?.featureTypes ?? null),
    frameworks: compareSets(classical(guessed)?.frameworks ?? null, classical(answer)?.frameworks ?? null),
    operationTypes: compareSets(filters(guessed)?.operationTypes ?? null, filters(answer)?.operationTypes ?? null),
    kernelBased: compareNullableBoolean(filters(guessed)?.kernelBased ?? null, filters(answer)?.kernelBased ?? null),
    kernelSizes: compareSets(filters(guessed)?.kernelSizes ?? null, filters(answer)?.kernelSizes ?? null),
    linearity: compareScalar(filters(guessed)?.linearity ?? null, filters(answer)?.linearity ?? null),
    requiresTraining: compareNullableBoolean(filters(guessed)?.requiresTraining ?? null, filters(answer)?.requiresTraining ?? null),
    outputTypes: compareSets(filters(guessed)?.outputTypes ?? null, filters(answer)?.outputTypes ?? null),
  };
}
