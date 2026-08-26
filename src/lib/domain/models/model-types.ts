import { difficulties, isDifficulty, type Difficulty } from "../difficulty";

export const classicDifficulties = difficulties;
export type ClassicDifficulty = Difficulty;
export const classicCategories = [
  "llm",
  "cv",
  "nlp",
  "object-detection",
  "classical-ml",
  "filters",
  "hardcore",
] as const;
export type ClassicCategory = (typeof classicCategories)[number];
export const focusedClassicCategories = classicCategories.filter(
  (category) => category !== "hardcore",
) as Exclude<ClassicCategory, "hardcore">[];

export const classicCategoryDetails: Record<
  ClassicCategory,
  { label: string; catalogCategory?: string; routeSegment: string }
> = {
  llm: { label: "LLM", catalogCategory: "language-model", routeSegment: "llm" },
  cv: { label: "CV", catalogCategory: "computer-vision", routeSegment: "cv" },
  nlp: { label: "NLP", catalogCategory: "nlp", routeSegment: "nlp" },
  "object-detection": { label: "OD", catalogCategory: "object-detection", routeSegment: "od" },
  "classical-ml": {
    label: "Classical ML",
    catalogCategory: "classical-ml",
    routeSegment: "classical-ml",
  },
  filters: { label: "Filters", catalogCategory: "filters", routeSegment: "filters" },
  hardcore: { label: "Hardcore", routeSegment: "hardcore" },
};

export function classicCategoryFromRouteSegment(
  value: string | null | undefined,
): ClassicCategory | undefined {
  if (value === "image-processing") return "filters";
  return classicCategories.find(
    (category) => classicCategoryDetails[category].routeSegment === value,
  );
}

export function isClassicCategory(value: string | null | undefined): value is ClassicCategory {
  return classicCategories.includes(value as ClassicCategory);
}
export type ModelPoolRank = 0 | 1 | 2;

export function isClassicDifficulty(value: string | null | undefined): value is ClassicDifficulty {
  return isDifficulty(value);
}

export const classicDifficultyRank: Record<ClassicDifficulty, ModelPoolRank> = {
  normal: 0,
  challenge: 1,
  hardcore: 2,
};

const classicChallengeCategorySegments = {
  llm: "llm",
  cv: "cv",
  nlp: "nlp",
  "object-detection": "od",
  "classical-ml": "classical-ml",
  filters: "filters",
  hardcore: "hardcore",
} as const satisfies Record<ClassicCategory, string>;

type ClassicChallengeCategorySegment = (typeof classicChallengeCategorySegments)[ClassicCategory];
export type ClassicChallengeMode =
  `classic:${ClassicChallengeCategorySegment}:${ClassicDifficulty}`;

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

export function classicChallengeMode(
  category: ClassicCategory,
  difficulty: ClassicDifficulty,
): ClassicChallengeMode {
  return `classic:${classicChallengeCategorySegments[category]}:${difficulty}`;
}

export function classicModeFromChallengeMode(mode: string) {
  const [, segment, difficulty] = mode.split(":");
  const category =
    (Object.entries(classicChallengeCategorySegments).find(
      ([, value]) => value === segment,
    )?.[0] as ClassicCategory | undefined) ??
    ({ "object-detection": "object-detection", "image-processing": "filters" }[segment] as
      ClassicCategory | undefined);

  if (!category || !isClassicDifficulty(difficulty)) {
    throw new Error(`Invalid Classic challenge mode: ${mode}`);
  }

  return { category, difficulty };
}

export function canonicalClassicChallengeMode(mode: string): ClassicChallengeMode | null {
  try {
    const { category, difficulty } = classicModeFromChallengeMode(mode);
    return classicChallengeMode(category, difficulty);
  } catch {
    return null;
  }
}
export type ReasoningSupport = "native" | "optional" | "no" | "unknown";
export type WeightAvailability = "open" | "closed" | "restricted" | "unknown" | "not-applicable";
export type CategoryDetails = Partial<{
  "language-model": {
    supportedLanguages: string[];
    architecture?: string[];
    toolUse: boolean | null;
    multimodal: boolean;
  };
  "computer-vision": {
    visionTasks: string[];
    architecture: string[];
    trainingDatasets: string[];
    license: string | null;
  };
  nlp: {
    nlpTasks: string[];
    supportedLanguages: string[];
    architecture: string[];
    trainingDatasets: string[];
  };
  "object-detection": {
    detectionTypes: string[];
    architecture: string[];
    trainingDatasets: string[];
    realTimeCapable: boolean | null;
  };
  "classical-ml": {
    algorithmTypes: string[];
    learningParadigms: string[];
    objectives: string[];
    featureTypes: string[];
    frameworks: string[];
  };
  filters: {
    operationTypes: string[];
    kernelBased: boolean;
    kernelSizes: string[];
    linearity: "linear" | "non-linear" | "mixed";
    requiresTraining: boolean;
    outputTypes: string[];
    frameworks: string[];
  };
}>;

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
  family: string[] | null;
  categories: string[] | null;
  inputModalities: string[] | null;
  outputModalities: string[] | null;
  useCases: string[] | null;
  reasoningSupport: ReasoningSupport | null;
  weightAvailability: WeightAvailability | null;
  categoryDetails?: CategoryDetails;
  releaseYear: number | null;
  releaseDate: string | null;
  contextWindowTokens: number | null;
};
export type PublicGuessedModel = Required<Pick<ComparableModel, "id" | "name">> &
  Omit<ComparableModel, "id" | "name">;
