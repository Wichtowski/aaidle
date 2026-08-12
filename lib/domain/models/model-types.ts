export const classicDifficulties = ["normal", "challenge", "hardcore"] as const;
export type ClassicDifficulty = (typeof classicDifficulties)[number];
export const classicCategories = ["llm", "cv", "nlp", "object-detection", "classical-ml", "hardcore"] as const;
export type ClassicCategory = (typeof classicCategories)[number];
export const focusedClassicCategories = classicCategories.filter((category) => category !== "hardcore") as Exclude<
  ClassicCategory,
  "hardcore"
>[];

export const classicCategoryDetails: Record<ClassicCategory, { label: string; catalogCategory?: string }> = {
  llm: { label: "LLM", catalogCategory: "language-model" },
  cv: { label: "CV", catalogCategory: "computer-vision" },
  nlp: { label: "NLP", catalogCategory: "nlp" },
  "object-detection": { label: "Object detection", catalogCategory: "object-detection" },
  "classical-ml": { label: "Classical ML", catalogCategory: "classical-ml" },
  hardcore: { label: "Hardcore" },
};

export function isClassicCategory(value: string | null | undefined): value is ClassicCategory {
  return classicCategories.includes(value as ClassicCategory);
}
export type ModelPoolRank = 0 | 1 | 2;

export function isClassicDifficulty(value: string | null | undefined): value is ClassicDifficulty {
  return classicDifficulties.includes(value as ClassicDifficulty);
}

export const classicDifficultyRank: Record<ClassicDifficulty, ModelPoolRank> = {
  normal: 0,
  challenge: 1,
  hardcore: 2,
};

export type ClassicChallengeMode = `classic:${ClassicCategory}:${ClassicDifficulty}`;

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
  return `classic:${category}:${difficulty}`;
}

export function classicModeFromChallengeMode(mode: ClassicChallengeMode) {
  const [, category, difficulty] = mode.split(":");
  return { category: category as ClassicCategory, difficulty: difficulty as ClassicDifficulty };
}
export type ReasoningSupport = "native" | "optional" | "no" | "unknown";
export type WeightAvailability = "open" | "closed" | "restricted" | "unknown";
export type CategoryDetails = Partial<{
  "language-model": { supportedLanguages: string[]; toolUse: boolean | null; multimodal: boolean };
  "computer-vision": { visionTasks: string[]; architecture: string[]; trainingDatasets: string[]; license: string | null };
  nlp: { nlpTasks: string[]; supportedLanguages: string[]; architecture: string[]; trainingDatasets: string[] };
  "object-detection": { detectionTypes: string[]; architecture: string[]; trainingDatasets: string[]; realTimeCapable: boolean | null };
  "classical-ml": { algorithmTypes: string[]; learningParadigms: string[]; objectives: string[]; featureTypes: string[]; frameworks: string[] };
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
  family: string | null;
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
