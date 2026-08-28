import type { ClassicCategory, ComparableModel } from "./model-types";

export type ModelSpaceAxis = {
  label: string;
  value: (model: ComparableModel, anchorModel: ComparableModel) => number;
};

const count = (values: string[] | null | undefined) => values?.length ?? 0;
const contextScale = (model: ComparableModel) =>
  model.contextWindowTokens ? Math.log10(Math.max(1, model.contextWindowTokens)) : 0;
const releaseYear = (model: ComparableModel) => model.releaseYear ?? 0;
const setSimilarity = (
  values: string[] | null | undefined,
  anchorValues: string[] | null | undefined,
) => {
  const valueSet = new Set(values ?? []);
  const anchorSet = new Set(anchorValues ?? []);
  const union = new Set([...valueSet, ...anchorSet]);
  if (union.size === 0) return 0;

  return [...valueSet].filter((value) => anchorSet.has(value)).length / union.size;
};
const metadataBreadth = (model: ComparableModel) =>
  count(model.categories) +
  count(model.inputModalities) +
  count(model.outputModalities) +
  count(model.useCases) +
  Number(model.reasoningSupport === "native") +
  Number(model.weightAvailability === "open");
const kernelScale = (model: ComparableModel) =>
  Math.max(
    0,
    ...(model.categoryDetails?.filters?.kernelSizes ?? []).map((size) =>
      Math.max(...(size.match(/\d+/g)?.map(Number) ?? [0])),
    ),
  );

export function modelSpaceAxes(category: ClassicCategory): readonly ModelSpaceAxis[] {
  switch (category) {
    case "llm":
      return [
        { label: "Release year", value: releaseYear },
        { label: "Context scale", value: contextScale },
        { label: "Capability breadth", value: metadataBreadth },
      ];
    case "cv":
      return [
        { label: "Release year", value: releaseYear },
        {
          label: "Vision-task breadth",
          value: (model) =>
            count(model.categoryDetails?.["computer-vision"]?.visionTasks) + count(model.useCases),
        },
        {
          label: "Architecture & data breadth",
          value: (model) =>
            count(model.categoryDetails?.["computer-vision"]?.architecture) +
            count(model.categoryDetails?.["computer-vision"]?.trainingDatasets),
        },
      ];
    case "nlp":
      return [
        { label: "Release year", value: releaseYear },
        {
          label: "Language & task breadth",
          value: (model) =>
            count(model.categoryDetails?.nlp?.supportedLanguages) +
            count(model.categoryDetails?.nlp?.nlpTasks),
        },
        {
          label: "Architecture & data breadth",
          value: (model) =>
            count(model.categoryDetails?.nlp?.architecture) +
            count(model.categoryDetails?.nlp?.trainingDatasets),
        },
      ];
    case "object-detection":
      return [
        { label: "Release year", value: releaseYear },
        {
          label: "Detection breadth",
          value: (model) =>
            count(model.categoryDetails?.["object-detection"]?.detectionTypes) +
            count(model.useCases),
        },
        {
          label: "Architecture & data breadth",
          value: (model) =>
            count(model.categoryDetails?.["object-detection"]?.architecture) +
            count(model.categoryDetails?.["object-detection"]?.trainingDatasets),
        },
      ];
    case "classical-ml":
      return [
        { label: "Release year", value: releaseYear },
        {
          label: "Algorithm breadth",
          value: (model) =>
            count(model.categoryDetails?.["classical-ml"]?.algorithmTypes) +
            count(model.categoryDetails?.["classical-ml"]?.learningParadigms),
        },
        {
          label: "Objective & feature breadth",
          value: (model) =>
            count(model.categoryDetails?.["classical-ml"]?.objectives) +
            count(model.categoryDetails?.["classical-ml"]?.featureTypes),
        },
      ];
    case "filters":
      return [
        { label: "Release year", value: releaseYear },
        { label: "Kernel scale", value: kernelScale },
        {
          label: "Operation & output breadth",
          value: (model) =>
            count(model.categoryDetails?.filters?.operationTypes) +
            count(model.categoryDetails?.filters?.outputTypes),
        },
      ];
    case "hardcore":
      return [
        { label: "Release year", value: releaseYear },
        {
          label: "Category similarity",
          value: (model, anchorModel) => setSimilarity(model.categories, anchorModel.categories),
        },
        {
          label: "Use-case similarity",
          value: (model, anchorModel) => setSimilarity(model.useCases, anchorModel.useCases),
        },
      ];
  }
}

export function modelSpacePoint(
  model: ComparableModel,
  category: ClassicCategory,
  referenceModels: ComparableModel[],
  anchorModel: ComparableModel,
) {
  const axes = modelSpaceAxes(category);
  const normalize = (axis: ModelSpaceAxis) => {
    const values = referenceModels.map((referenceModel) => axis.value(referenceModel, anchorModel));
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum === maximum) return 0;
    return ((axis.value(model, anchorModel) - minimum) / (maximum - minimum)) * 2 - 1;
  };

  return { x: normalize(axes[0]), y: normalize(axes[1]), z: normalize(axes[2]) };
}
