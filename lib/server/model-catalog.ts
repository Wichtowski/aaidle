import rawModels from "../../data/models.seed.json";
import { classicCategoryDetails, classicDifficultyRank } from "../domain/models/model-types";
import type {
  ClassicCategory,
  ClassicDifficulty,
  ComparableModel,
  ModelPoolRank,
  PublicModelIndex,
  ReasoningSupport,
  WeightAvailability,
  CategoryDetails,
} from "../domain/models/model-types";

type SeedModel = {
  id: string;
  name: string;
  minPool: ModelPoolRank;
  provider?: string;
  country?: string;
  family?: string;
  categories: string[];
  inputModalities?: string[];
  outputModalities?: string[];
  useCases?: string[];
  reasoningSupport?: ReasoningSupport;
  weightAvailability?: WeightAvailability;
  categoryDetails?: CategoryDetails;
  releaseDate?: string;
  contextWindowTokens?: number;
  aliases?: string[];
};

type CatalogModel = ComparableModel & { aliases: string[]; minPool: ModelPoolRank };

const readable = (value: string) => value.replaceAll("-", " ");

const readableList = (values: string[] | undefined) => values?.map(readable) ?? null;

const normalizeCategoryDetails = (details: CategoryDetails | undefined): CategoryDetails => {
  const language = details?.["language-model"];

  if (!language) return details ?? {};

  return {
    ...details,
    "language-model": {
      ...language,
      toolUse: language.toolUse ?? false,
    },
  };
};

const models: CatalogModel[] = (rawModels as SeedModel[]).map((model) => ({
  id: model.id,
  name: model.name,
  minPool: model.minPool,
  provider: model.provider ?? null,
  country: model.country ?? null,
  family: model.family ?? null,
  categories: model.categories.map(readable),
  inputModalities: readableList(model.inputModalities),
  outputModalities: readableList(model.outputModalities),
  useCases: readableList(model.useCases),
  reasoningSupport: model.reasoningSupport ?? null,
  weightAvailability: model.weightAvailability ?? null,
  categoryDetails: normalizeCategoryDetails(model.categoryDetails),
  releaseYear: model.releaseDate ? Number(model.releaseDate.slice(0, 4)) : null,
  releaseDate: model.releaseDate ?? null,
  contextWindowTokens: model.contextWindowTokens ?? null,
  aliases: [...(model.aliases ?? [])],
}));

const byId = new Map(models.map((model) => [model.id, model]));

const publicModelIndexFor = (difficulty: ClassicDifficulty): PublicModelIndex[] =>
  models
    .filter((model) => model.minPool <= classicDifficultyRank[difficulty])
    .map(({ id, name, provider, family, aliases }) => ({
      id,
      name,
      providerName: provider ?? "Unknown",
      familyName: family ?? "Unknown",
      aliases,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

export const publicModelIndexByDifficulty: Record<ClassicDifficulty, PublicModelIndex[]> = {
  normal: publicModelIndexFor("normal"),
  challenge: publicModelIndexFor("challenge"),
  hardcore: publicModelIndexFor("hardcore"),
};

export const eligibleModelIdsByDifficulty: Record<ClassicDifficulty, string[]> = {
  normal: models.filter((model) => model.minPool <= 0).map((model) => model.id),
  challenge: models.filter((model) => model.minPool <= 1).map((model) => model.id),
  hardcore: models.filter((model) => model.minPool <= 2).map((model) => model.id),
};

const isInCategory = (model: CatalogModel, category: ClassicCategory) =>
  category === "hardcore" ||
  model.categories?.some(
    (value) => value === readable(classicCategoryDetails[category].catalogCategory ?? ""),
  );

const categoryModels = (category: ClassicCategory) =>
  models
    .filter((model) => isInCategory(model, category))
    .sort((left, right) => left.id.localeCompare(right.id));

const modelsForClassicDifficulty = (category: ClassicCategory, difficulty: ClassicDifficulty) => {
  const pool = categoryModels(category);
  if (category === "hardcore" || difficulty === "hardcore" || difficulty === "challenge") return pool;

  const normalPool = pool.filter((model) => model.minPool <= classicDifficultyRank.normal);

  // Some focused categories do not yet have enough Normal-ranked models. Keep them playable
  // without arbitrarily excluding Normal-ranked models from categories with a larger catalogue.
  return normalPool.length >= 8 ? normalPool : pool.slice(0, Math.max(8, Math.ceil(pool.length * 0.4)));
};

export const publicModelIndexForClassic = (category: ClassicCategory, difficulty: ClassicDifficulty) =>
  modelsForClassicDifficulty(category, difficulty)
    .map(({ id, name, provider, family, aliases }) => ({
      id,
      name,
      providerName: provider ?? "N/A",
      familyName: family ?? "N/A",
      aliases,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

export const eligibleModelIdsForClassic = (category: ClassicCategory, difficulty: ClassicDifficulty) =>
  modelsForClassicDifficulty(category, difficulty).map((model) => model.id);

export function isModelEligibleForDifficulty(id: string, difficulty: ClassicDifficulty): boolean {
  return (byId.get(id)?.minPool ?? Infinity) <= classicDifficultyRank[difficulty];
}

export function isModelEligibleForClassic(
  id: string,
  category: ClassicCategory,
  difficulty: ClassicDifficulty,
): boolean {
  return eligibleModelIdsForClassic(category, difficulty).includes(id);
}

export function catalogModel(id: string): ComparableModel | null {
  const model = byId.get(id);
  if (!model) return null;

  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    country: model.country,
    family: model.family,
    categories: model.categories,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    useCases: model.useCases,
    reasoningSupport: model.reasoningSupport,
    weightAvailability: model.weightAvailability,
    categoryDetails: model.categoryDetails,
    releaseYear: model.releaseYear,
    releaseDate: model.releaseDate,
    contextWindowTokens: model.contextWindowTokens,
  };
}
