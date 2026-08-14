import { database } from "../../../db/client";
import { catalogModel, isModelEligibleForClassic } from "../../../server/model-catalog";
import {
  classicModeFromChallengeMode,
  type ClassicChallengeMode,
} from "../../models/model-types";
import { compareClassicModels } from "../../guesses/comparison-engine";
import { hasHardcoreAccess } from "./hardcore-access";
import { createTrajectoryAccessToken } from "./trajectory-access";

export async function submitClassicGuess(input: {
  guessedModelId: string;
  attemptNumber: number;
  challengeId: string;
  completedByUserId?: string | null;
}) {
  const DB = database();
  const challenge = await DB.prepare(
    "SELECT answer_model_id, mode FROM daily_challenges WHERE id=? AND mode LIKE 'classic:%'",
  )
    .bind(input.challengeId)
    .first<{ answer_model_id: string; mode: ClassicChallengeMode }>();
  if (!challenge) throw new Error("CHALLENGE_NOT_FOUND");

  const { category, difficulty } = classicModeFromChallengeMode(challenge.mode);
  if (category === "hardcore" && (!input.completedByUserId || !(await hasHardcoreAccess(input.completedByUserId)))) {
    throw new Error("HARDCORE_LOCKED");
  }
  if (!isModelEligibleForClassic(input.guessedModelId, category, difficulty)) {
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

  const isCorrect = guessed.id === answer.id;
  let globalCompletionCount: number | null = null;
  if (isCorrect && input.completedByUserId) {
    await DB.prepare(
      "INSERT OR IGNORE INTO user_challenge_completions (user_id, challenge_id, completed_at) VALUES (?, ?, ?)",
    )
      .bind(input.completedByUserId, input.challengeId, Date.now())
      .run();
    globalCompletionCount = await globalClassicCompletionCount(input.challengeId);
  }

  return {
    guess: {
      model: guessed,
      comparison,
      isCorrect,
      attemptNumber: input.attemptNumber,
      sameGuessCount: 0,
      matchingCategories: matches(guessed.categories, answer.categories),
      matchingInputModalities: matches(guessed.inputModalities, answer.inputModalities),
      matchingOutputModalities: matches(guessed.outputModalities, answer.outputModalities),
      matchingUseCases: matches(guessed.useCases, answer.useCases),
    },
    trajectoryAccessToken: isCorrect
      ? createTrajectoryAccessToken({ challengeId: input.challengeId, answerModelId: answer.id })
      : null,
    globalCompletionCount,
    playerStats: null,
  };
}

export async function globalClassicCompletionCount(challengeId: string): Promise<number> {
  const count = await database()
    .prepare("SELECT completion_count AS count FROM challenge_completion_counts WHERE challenge_id=?")
    .bind(challengeId)
    .first<{ count: number }>();
  return count?.count ?? 0;
}
