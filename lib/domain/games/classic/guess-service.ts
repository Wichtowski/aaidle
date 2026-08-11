import { database } from "../../../db/client";
import { catalogModel } from "../../../server/model-catalog";
import { compareClassicModels } from "../../guesses/comparison-engine";

export async function submitClassicGuess(input: {
  guessedModelId: string;
  attemptNumber: number;
  challengeId: string;
}) {
  const DB = database();
  const challenge = await DB.prepare("SELECT * FROM daily_challenges WHERE id=? AND mode='classic'")
    .bind(input.challengeId)
    .first<{ answer_model_id: string }>();
  if (!challenge) throw new Error("CHALLENGE_NOT_FOUND");

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
