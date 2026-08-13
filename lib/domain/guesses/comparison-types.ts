export type ScalarComparison = "correct" | "incorrect" | "unknown";
export type SetComparison = "correct" | "partial" | "incorrect" | "unknown";
export type NumberComparison = "correct" | "higher" | "lower" | "unknown";

export const classicColumns = [
  "provider", "country", "family", "categories", "inputModalities", "outputModalities", "useCases",
  "reasoningSupport", "release", "contextWindowTokens", "weightAvailability",
  "supportedLanguages", "toolUse", "multimodal", "visionTasks", "architecture", "trainingDatasets",
  "license", "nlpTasks", "detectionTypes", "realTimeCapable", "algorithmTypes", "learningParadigms",
  "objectives", "featureTypes", "frameworks", "operationTypes", "kernelBased", "kernelSizes",
  "linearity", "requiresTraining", "outputTypes",
] as const;
export type ClassicColumn = (typeof classicColumns)[number];
export type ClassicComparison = Record<string, ScalarComparison | SetComparison | NumberComparison>;

export const classicColumnHeadings: Record<ClassicColumn, string> = {
  provider: "Provider", country: "Country", family: "Family", categories: "Categories", inputModalities: "Input", outputModalities: "Output", useCases: "Use cases", reasoningSupport: "Reasoning", release: "Release", contextWindowTokens: "Context", weightAvailability: "Weights",
  supportedLanguages: "Languages", toolUse: "Tool calling", multimodal: "Multimodal", visionTasks: "Vision tasks", architecture: "Architecture", trainingDatasets: "Training data", license: "License", nlpTasks: "NLP tasks", detectionTypes: "Detection", realTimeCapable: "Real-time", algorithmTypes: "Algorithm", learningParadigms: "Learning", objectives: "Objective", featureTypes: "Features", frameworks: "Framework", operationTypes: "Operation", kernelBased: "Kernel", kernelSizes: "Kernel sizes", linearity: "Linearity", requiresTraining: "Training", outputTypes: "Output types",
};

const base = ["provider", "country", "family", "inputModalities", "outputModalities", "useCases", "release", "weightAvailability"] as const;
export const classicColumnsByCategory = {
  llm: [...base, "reasoningSupport", "contextWindowTokens", "toolUse", "multimodal"],
  cv: [...base, "visionTasks", "architecture", "trainingDatasets", "license"],
  nlp: [...base, "contextWindowTokens", "nlpTasks", "supportedLanguages", "architecture", "trainingDatasets"],
  "object-detection": [...base, "detectionTypes", "architecture", "trainingDatasets", "realTimeCapable"],
  "classical-ml": [...base, "algorithmTypes", "learningParadigms", "objectives", "featureTypes", "frameworks"],
  filters: ["provider", "country", "family", "release", "operationTypes", "kernelBased", "linearity", "outputModalities"],
  hardcore: ["provider", "categories", "inputModalities", "outputModalities", "useCases", "release", "weightAvailability"],
} as const satisfies Record<string, readonly ClassicColumn[]>;

export function classicColumnsForGame(category: keyof typeof classicColumnsByCategory, difficulty: "normal" | "challenge" | "hardcore"): readonly ClassicColumn[] {
  const columns = classicColumnsByCategory[category];
  return difficulty === "normal" ? columns : columns.filter((column) => column !== "country");
}
