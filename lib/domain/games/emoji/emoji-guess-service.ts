import { database } from "../../../db/client";
import { publicModelFamilies } from "../../../server/model-catalog";
import { emojiPilotPool } from "./prototype";
import {
  globalEmojiCompletionCount,
  puzzleForEmojiChallenge,
  type EmojiDailyChallenge,
} from "./emoji-game-service";

export async function submitEmojiGuess(input: {
  challengeId: string;
  guessedFamilyId: string;
  attemptNumber: number;
  completedByUserId?: string | null;
}) {
  const DB = database();
  const challenge = await DB.prepare(
    'SELECT id, challenge_date AS "challengeDate", mode, answer_model_id AS "answerModelId", selection_version AS "selectionVersion", generated_at AS "generatedAt", generation_source AS "generationSource" FROM daily_challenges WHERE id=? AND mode=?',
  )
    .bind(input.challengeId, "emoji:family")
    .first<EmojiDailyChallenge>();
  if (!challenge) throw new Error("CHALLENGE_NOT_FOUND");

  const families = publicModelFamilies(emojiPilotPool.map((entry) => entry.familyId));
  const guessedFamily = families.find((family) => family.id === input.guessedFamilyId);
  if (!guessedFamily) throw new Error("FAMILY_NOT_AVAILABLE");

  const answerFamilyId = puzzleForEmojiChallenge(challenge).familyId;
  const isCorrect = guessedFamily.id === answerFamilyId;
  let globalCompletionCount: number | null = null;

  if (isCorrect && input.completedByUserId) {
    await DB.prepare(
      "INSERT OR IGNORE INTO user_challenge_completions (user_id, challenge_id, completed_at) VALUES (?, ?, ?)",
    )
      .bind(input.completedByUserId, input.challengeId, Date.now())
      .run();
    globalCompletionCount = await globalEmojiCompletionCount(input.challengeId);
  }

  return {
    guess: {
      family: {
        id: guessedFamily.id,
        name: guessedFamily.name,
        providerName: guessedFamily.providerName,
      },
      isCorrect,
      attemptNumber: input.attemptNumber,
    },
    globalCompletionCount,
  };
}
