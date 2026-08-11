import rawModels from "../../data/models.seed.json";
import type {
  ComparableModel,
  LocalExecution,
  PublicModelIndex,
  ReasoningSupport,
} from "../domain/models/model-types";

type CatalogModel = ComparableModel & { aliases: string[] };

const readable = (value: string) => value.replaceAll("-", " ");

const models: CatalogModel[] = rawModels.map((model) => ({
  id: model.id,
  name: model.name,
  provider: model.provider,
  country: model.country,
  family: model.family,
  categories: model.categories.map(readable),
  inputModalities: model.inputModalities.map(readable),
  outputModalities: model.outputModalities.map(readable),
  useCases: model.useCases.map(readable),
  reasoningSupport: model.reasoningSupport as ReasoningSupport,
  openWeights: model.openWeights,
  localExecution: model.localExecution as LocalExecution,
  releaseYear: Number(model.releaseDate.slice(0, 4)),
  releaseDate: model.releaseDate,
  contextWindowTokens: model.contextWindowTokens,
  aliases: [...model.aliases],
}));

const byId = new Map(models.map((model) => [model.id, model]));

export const publicModelIndex: PublicModelIndex[] = models
  .map(({ id, name, provider, family, aliases }) => ({
    id,
    name,
    providerName: provider ?? "Unknown",
    familyName: family ?? "Unknown",
    aliases,
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

export const eligibleModelIds = models.map((model) => model.id);

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
