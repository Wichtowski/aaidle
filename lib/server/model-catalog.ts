import rawModels from "../../data/models.seed.json";
import { classicDifficultyRank } from "../domain/models/model-types";
import type {
  ClassicDifficulty,
  ComparableModel,
  ModelPoolRank,
  LocalExecution,
  PublicModelIndex,
  ReasoningSupport,
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
  openWeights?: boolean;
  localExecution?: LocalExecution;
  releaseDate?: string;
  contextWindowTokens?: number;
  aliases?: string[];
};

type CatalogModel = ComparableModel & { aliases: string[]; minPool: ModelPoolRank };

const readable = (value: string) => value.replaceAll("-", " ");

const readableList = (values: string[] | undefined) => values?.map(readable) ?? null;

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
  openWeights: model.openWeights ?? null,
  localExecution: model.localExecution ?? null,
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

export function isModelEligibleForDifficulty(id: string, difficulty: ClassicDifficulty): boolean {
  return (byId.get(id)?.minPool ?? Infinity) <= classicDifficultyRank[difficulty];
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
    openWeights: model.openWeights,
    localExecution: model.localExecution,
    releaseYear: model.releaseYear,
    releaseDate: model.releaseDate,
    contextWindowTokens: model.contextWindowTokens,
  };
}
