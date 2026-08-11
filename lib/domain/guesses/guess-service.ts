import { database } from "../../db/client";
import { compareClassicModels } from "./comparison-engine";
import type { ComparableModel } from "../models/model-types";

const countryNames: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  CN: "China",
  FR: "France",
  PL: "Poland",
};
const modelSql = `SELECT m.id,m.name,p.name provider,p.country_code country,f.name family,m.release_date releaseDate,m.reasoning_support reasoningSupport,m.open_weights openWeights,m.local_execution localExecution,m.release_year releaseYear,m.context_window_tokens contextWindowTokens FROM models m JOIN providers p ON p.id=m.provider_id LEFT JOIN model_families f ON f.id=m.family_id WHERE m.id=?`;
async function hydrate(DB: D1Database, id: string): Promise<ComparableModel | null> {
  const base = await DB.prepare(modelSql).bind(id).first<ComparableModel>();
  if (!base) return null;
  const terms = async (table: string, lookup: string, foreignKey: string) =>
    (
      await DB.prepare(
        `SELECT ${lookup}.name FROM ${table} link JOIN ${lookup} ON ${lookup}.id=link.${foreignKey} WHERE link.model_id=?`,
      )
        .bind(id)
        .all<{ name: string }>()
    ).results.map((row) => row.name);
  return {
    ...base,
    country: base.country ? (countryNames[base.country] ?? base.country) : null,
    openWeights: base.openWeights === null ? null : Boolean(base.openWeights),
    categories: await terms("model_categories", "categories", "category_id"),
    inputModalities: await terms("model_input_modalities", "modalities", "modality_id"),
    outputModalities: await terms("model_output_modalities", "modalities", "modality_id"),
    useCases: await terms("model_use_cases", "use_cases", "use_case_id"),
  };
}
export async function submitGuess(input: {
  guessedModelId: string;
  attemptNumber: number;
  challengeId: string;
}) {
  const DB = database();
  const challenge = await DB.prepare("SELECT * FROM daily_challenges WHERE id=? AND mode='classic'")
    .bind(input.challengeId)
    .first<{ answer_model_id: string }>();
  if (!challenge) throw new Error("CHALLENGE_NOT_FOUND");

  const [guessed, answer] = await Promise.all([
    hydrate(DB, input.guessedModelId),
    hydrate(DB, challenge.answer_model_id),
  ]);
  if (!guessed || !answer) throw new Error("MODEL_NOT_FOUND");

  const comparison = compareClassicModels(guessed, answer);
  const matches = (guessedValues: string[] | null, answerValues: string[] | null) =>
    (guessedValues ?? []).filter((value) =>
      (answerValues ?? []).some(
        (answerValue) => answerValue.toLocaleLowerCase() === value.toLocaleLowerCase(),
      ),
    );

  return {
    guess: {
      model: guessed,
      comparison,
      isCorrect: guessed.id === answer.id,
      attemptNumber: input.attemptNumber,
      sameGuessCount: 0,
      matchingCategories: matches(guessed.categories, answer.categories),
      matchingInputModalities: matches(guessed.inputModalities, answer.inputModalities),
      matchingOutputModalities: matches(guessed.outputModalities, answer.outputModalities),
      matchingUseCases: matches(guessed.useCases, answer.useCases),
    },
    playerStats: null,
  };
}
