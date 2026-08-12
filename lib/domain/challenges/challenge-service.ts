import { database } from "../../db/client";
import { eligibleModelIdsByDifficulty } from "../../server/model-catalog";
import { classicColumns } from "../guesses/comparison-types";
import type { DailyChallenge, PublicDailyChallengeDto } from "./challenge-types";
import { selectDistinctClassicDailyModels } from "./daily-selector";
import { expiresAt } from "../../utils/dates";
import {
  classicChallengeMode,
  classicDifficulties,
  classicDifficultyFromChallengeMode,
  type ClassicDifficulty,
} from "../models/model-types";

const pendingChallengesByDate = new Map<string, Promise<Record<ClassicDifficulty, DailyChallenge>>>();

const challengeSql =
  'SELECT id, challenge_date AS "challengeDate", mode, answer_model_id AS "answerModelId", selection_version AS "selectionVersion", generated_at AS "generatedAt", generation_source AS "generationSource" FROM daily_challenges';

async function createDailyClassicChallenges(
  date: string,
): Promise<Record<ClassicDifficulty, DailyChallenge>> {
  const DB = database();
  const modeByDifficulty = Object.fromEntries(
    classicDifficulties.map((difficulty) => [difficulty, classicChallengeMode(difficulty)]),
  ) as Record<ClassicDifficulty, string>;
  const existing = await DB.prepare(
    `${challengeSql} WHERE challenge_date=? AND mode IN (?, ?, ?)`,
  )
    .bind(
      date,
      modeByDifficulty.normal,
      modeByDifficulty.challenge,
      modeByDifficulty.hardcore,
    )
    .all<DailyChallenge>();
  const challenges = {} as Partial<Record<ClassicDifficulty, DailyChallenge>>;

  for (const challenge of existing.results) {
    challenges[classicDifficultyFromChallengeMode(challenge.mode)] = challenge;
  }

  const secret = process.env.DAILY_SELECTION_SECRET;
  const fallback = "local-development-secret";
  const isProduction =
    (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ===
    "production";

  if (!secret && isProduction) throw new Error("DAILY_SELECTION_SECRET is required in production");
  if (!secret) console.warn("DAILY_SELECTION_SECRET is missing; using local development fallback.");

  const recentlyUsedByDifficulty = {} as Record<ClassicDifficulty, string[]>;
  for (const difficulty of classicDifficulties) {
    const recent = await DB.prepare(
      "SELECT answer_model_id AS id FROM daily_challenges WHERE mode=? ORDER BY challenge_date DESC LIMIT 60",
    )
      .bind(modeByDifficulty[difficulty])
      .all<{ id: string }>();
    recentlyUsedByDifficulty[difficulty] = recent.results.map((row) => row.id);
  }

  const selected = await selectDistinctClassicDailyModels({
    date,
    secret: secret ?? fallback,
    modelsByDifficulty: Object.fromEntries(
      classicDifficulties.map((difficulty) => [
        difficulty,
        eligibleModelIdsByDifficulty[difficulty].map((id) => ({ id })),
      ]),
    ) as Record<ClassicDifficulty, { id: string }[]>,
    recentlyUsedByDifficulty,
  });

  for (const difficulty of classicDifficulties) {
    if (challenges[difficulty]) continue;

    const challenge: DailyChallenge = {
      id: crypto.randomUUID(),
      challengeDate: date,
      mode: classicChallengeMode(difficulty),
      answerModelId: selected[difficulty].id,
      selectionVersion: 2,
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
  }

  const saved = await DB.prepare(`${challengeSql} WHERE challenge_date=? AND mode IN (?, ?, ?)`)
    .bind(
      date,
      modeByDifficulty.normal,
      modeByDifficulty.challenge,
      modeByDifficulty.hardcore,
    )
    .all<DailyChallenge>();

  for (const challenge of saved.results) {
    challenges[classicDifficultyFromChallengeMode(challenge.mode)] = challenge;
  }

  return challenges as Record<ClassicDifficulty, DailyChallenge>;
}

export async function ensureDailyChallenge({
  date,
  difficulty = "normal",
}: {
  date: string;
  difficulty?: ClassicDifficulty;
}): Promise<DailyChallenge> {
  const pending = pendingChallengesByDate.get(date);
  if (pending) return (await pending)[difficulty];

  const creation = createDailyClassicChallenges(date);
  pendingChallengesByDate.set(date, creation);

  try {
    return (await creation)[difficulty];
  } finally {
    pendingChallengesByDate.delete(date);
  }
}

export function publicChallenge(challenge: DailyChallenge): PublicDailyChallengeDto {
  return {
    id: challenge.id,
    date: challenge.challengeDate,
    mode: classicDifficultyFromChallengeMode(challenge.mode),
    expiresAt: new Date(expiresAt(challenge.challengeDate)).toISOString(),
    columns: [...classicColumns],
  };
}
