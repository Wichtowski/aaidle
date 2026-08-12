import { database } from "../../../db/client";
import { catalogModel, isModelEligibleForDifficulty } from "../../../server/model-catalog";
import {
  classicDifficultyFromChallengeMode,
  type ClassicChallengeMode,
} from "../../models/model-types";
import { compareClassicModels } from "../../guesses/comparison-engine";

export async function submitClassicGuess(input: {
  guessedModelId: string;
  attemptNumber: number;
  challengeId: string;
}) {
  const DB = database();
  const challenge = await DB.prepare(
    "SELECT answer_model_id, mode FROM daily_challenges WHERE id=? AND mode LIKE 'classic:%'",
  )
    .bind(input.challengeId)
    .first<{ answer_model_id: string; mode: ClassicChallengeMode }>();
  if (!challenge) throw new Error("CHALLENGE_NOT_FOUND");

  const difficulty = classicDifficultyFromChallengeMode(challenge.mode);
  if (!isModelEligibleForDifficulty(input.guessedModelId, difficulty)) {
    throw new Error("MODEL_NOT_AVAILABLE");
  }

  const guessed = catalogModel(input.guessedModelId);
  const answer = catalogModel(challenge.answer_model_id);
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
