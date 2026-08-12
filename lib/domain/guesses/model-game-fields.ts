export const GAME_MODE = {
  NORMAL: "normal",
  CHALLENGE: "challenge",
  HARDCORE: "hardcore",
} as const;

export type GameMode = (typeof GAME_MODE)[keyof typeof GAME_MODE];

export const FOCUSED_CATEGORY = {
  LANGUAGE_MODEL: "language-model",
  COMPUTER_VISION: "computer-vision",
  NLP: "nlp",
  OBJECT_DETECTION: "object-detection",
  CLASSICAL_ML: "classical-ml",
} as const;

export type FocusedCategory =
  (typeof FOCUSED_CATEGORY)[keyof typeof FOCUSED_CATEGORY];

export const COMMON_FIELDS = [
  "provider",
  "country",
  "family",
  "inputModalities",
  "outputModalities",
  "useCases",
  "releaseDate",
  "weightAvailability",
] as const;

export const HARDCORE_FIELDS = [
  "provider",
  "family",
  "categories",
  "inputModalities",
  "outputModalities",
  "useCases",
  "releaseDate",
  "weightAvailability",
] as const;

const NORMAL_CATEGORY_FIELDS = {
  "language-model": [
    "provider",
    "country",
    "family",
    "inputModalities",
    "outputModalities",
    "useCases",
    "reasoningSupport",
    "releaseDate",
    "contextWindowTokens",
    "categoryDetails.language-model.supportedLanguages",
    "categoryDetails.language-model.toolUse",
    "categoryDetails.language-model.multimodal",
    "weightAvailability",
  ],

  "computer-vision": [
    "provider",
    "country",
    "family",
    "inputModalities",
    "outputModalities",
    "useCases",
    "releaseDate",
    "categoryDetails.computer-vision.visionTasks",
    "categoryDetails.computer-vision.architecture",
    "categoryDetails.computer-vision.trainingDatasets",
    "categoryDetails.computer-vision.license",
    "weightAvailability",
  ],

  nlp: [
    "provider",
    "country",
    "family",
    "inputModalities",
    "outputModalities",
    "useCases",
    "releaseDate",
    "contextWindowTokens",
    "categoryDetails.nlp.nlpTasks",
    "categoryDetails.nlp.supportedLanguages",
    "categoryDetails.nlp.architecture",
    "categoryDetails.nlp.trainingDatasets",
    "weightAvailability",
  ],

  "object-detection": [
    "provider",
    "country",
    "family",
    "inputModalities",
    "outputModalities",
    "useCases",
    "releaseDate",
    "categoryDetails.object-detection.detectionTypes",
    "categoryDetails.object-detection.architecture",
    "categoryDetails.object-detection.trainingDatasets",
    "categoryDetails.object-detection.realTimeCapable",
    "weightAvailability",
  ],

  "classical-ml": [
    "provider",
    "country",
    "family",
    "inputModalities",
    "outputModalities",
    "useCases",
    "releaseDate",
    "categoryDetails.classical-ml.algorithmTypes",
    "categoryDetails.classical-ml.learningParadigms",
    "categoryDetails.classical-ml.objectives",
    "categoryDetails.classical-ml.featureTypes",
    "categoryDetails.classical-ml.frameworks",
    "weightAvailability",
  ],
} as const satisfies Record<FocusedCategory, readonly string[]>;

export function getBoardFields(
  mode: GameMode,
  category: FocusedCategory,
): readonly string[] {
  if (mode === GAME_MODE.HARDCORE) {
    // Deliberately category-agnostic and NEVER contains country.
    return HARDCORE_FIELDS;
  }

  const fields = NORMAL_CATEGORY_FIELDS[category];

  if (mode === GAME_MODE.CHALLENGE) {
    // Challenge keeps the focused-category board but removes Country.
    return fields.filter((field) => field !== "country");
  }

  return fields;
}

export function isEligibleForPool(
  model: { minPool: 0 | 1 | 2 },
  selectedPool: 0 | 1 | 2,
): boolean {
  return model.minPool <= selectedPool;
}
