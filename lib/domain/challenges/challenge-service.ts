import { database } from "../../db/client";
import { eligibleModelIds } from "../../server/model-catalog";
import { classicColumns } from "../guesses/comparison-types";
import type { DailyChallenge, PublicDailyChallengeDto } from "./challenge-types";
import { selectDailyModel } from "./daily-selector";
import { expiresAt } from "../../utils/dates";

export async function ensureDailyChallenge({
  date,
  mode = "classic",
}: {
  date: string;
  mode?: "classic";
}): Promise<DailyChallenge> {
  const DB = database();
  const challengeSql =
    'SELECT id, challenge_date AS "challengeDate", mode, answer_model_id AS "answerModelId", selection_version AS "selectionVersion", generated_at AS "generatedAt", generation_source AS "generationSource" FROM daily_challenges';
  const current = await DB.prepare(`${challengeSql} WHERE challenge_date=? AND mode=?`)
    .bind(date, mode)
    .first<DailyChallenge>();
  if (current) return current;
  const recent = await DB.prepare(
    "SELECT answer_model_id AS id FROM daily_challenges WHERE mode=? ORDER BY challenge_date DESC LIMIT 60",
  )
    .bind(mode)
    .all<{ id: string }>();
  const secret = process.env.DAILY_SELECTION_SECRET;
  const fallback = "local-development-secret";
  const isProduction =
    (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ===
    "production";
  if (!secret && isProduction) throw new Error("DAILY_SELECTION_SECRET is required in production");
  if (!secret) console.warn("DAILY_SELECTION_SECRET is missing; using local development fallback.");
  const answer = await selectDailyModel({
    date,
    mode,
    secret: secret ?? fallback,
    models: eligibleModelIds.map((id) => ({ id })),
    recentlyUsed: recent.results.map((row) => row.id),
  });
  const challenge: DailyChallenge = {
    id: crypto.randomUUID(),
    challengeDate: date,
    mode,
    answerModelId: answer.id,
    selectionVersion: 1,
    generatedAt: Date.now(),
    generationSource: "lazy",
  };
  await DB.prepare(
    "INSERT INTO daily_challenges (id, challenge_date, mode, answer_model_id, selection_version, generated_at, generation_source) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (challenge_date, mode) DO NOTHING",
  )
    .bind(
      challenge.id,
      challenge.challengeDate,
      challenge.mode,
      challenge.answerModelId,
      challenge.selectionVersion,
      challenge.generatedAt,
      challenge.generationSource,
    )
    .run();
  return (await DB.prepare(`${challengeSql} WHERE challenge_date=? AND mode=?`)
    .bind(date, mode)
    .first<DailyChallenge>())!;
}
export function publicChallenge(challenge: DailyChallenge): PublicDailyChallengeDto {
  return {
    id: challenge.id,
    date: challenge.challengeDate,
    mode: "classic",
    expiresAt: new Date(expiresAt(challenge.challengeDate)).toISOString(),
    columns: [...classicColumns],
  };
}
