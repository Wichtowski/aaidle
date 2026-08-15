import { database } from "../../../db/client";
import { publicModelFamilies } from "../../../server/model-catalog";
import { expiresAt, utcDate } from "../../../utils/dates";
import { emojiPilotPool, generateEmojiPuzzle, type ResolvedEmojiPuzzle } from "./prototype";

const mode = "emoji:family";
const selectionVersion = 1;
const pendingChallenges = new Map<string, Promise<EmojiDailyChallenge>>();

export type EmojiDailyChallenge = {
  id: string;
  challengeDate: string;
  mode: typeof mode;
  answerModelId: string;
  selectionVersion: number;
  generatedAt: number;
  generationSource: "lazy";
};

export type PublicEmojiChallenge = {
  id: string;
  date: string;
  mode: "emoji";
  expiresAt: string;
  initialEmoji: string[];
  maximumEmoji: number;
};

export type PublicEmojiGame = {
  challenge: PublicEmojiChallenge;
  families: ReturnType<typeof publicModelFamilies>;
  globalCompletionCount: number;
};

function challengeSeed(date: string) {
  const secret = process.env.DAILY_SELECTION_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  if (!secret && isProduction) throw new Error("DAILY_SELECTION_SECRET is required in production");
  if (!secret) console.warn("DAILY_SELECTION_SECRET is missing; using local development fallback.");
  return `${secret ?? "local-development-secret"}:emoji:${date}`;
}

async function createDailyEmojiChallenge(date: string): Promise<EmojiDailyChallenge> {
  const DB = database();
  const existing = await DB.prepare(
    'SELECT id, challenge_date AS "challengeDate", mode, answer_model_id AS "answerModelId", selection_version AS "selectionVersion", generated_at AS "generatedAt", generation_source AS "generationSource" FROM daily_challenges WHERE challenge_date=? AND mode=?',
  )
    .bind(date, mode)
    .first<EmojiDailyChallenge>();
  if (existing) return existing;

  const puzzle = generateEmojiPuzzle({ date, challengeSeed: challengeSeed(date) });
  const representative = publicModelFamilies([puzzle.familyId])[0];
  if (!representative)
    throw new Error(`Emoji family is missing from the catalog: ${puzzle.familyId}`);

  const challenge: EmojiDailyChallenge = {
    id: crypto.randomUUID(),
    challengeDate: date,
    mode,
    answerModelId: representative.representativeModelId,
    selectionVersion,
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

  return (await DB.prepare(
    'SELECT id, challenge_date AS "challengeDate", mode, answer_model_id AS "answerModelId", selection_version AS "selectionVersion", generated_at AS "generatedAt", generation_source AS "generationSource" FROM daily_challenges WHERE challenge_date=? AND mode=?',
  )
    .bind(date, mode)
    .first<EmojiDailyChallenge>())!;
}

export async function ensureDailyEmojiChallenge(date = utcDate()): Promise<EmojiDailyChallenge> {
  const pending = pendingChallenges.get(date);
  if (pending) return pending;

  const creation = createDailyEmojiChallenge(date);
  pendingChallenges.set(date, creation);
  try {
    return await creation;
  } finally {
    pendingChallenges.delete(date);
  }
}

export function puzzleForEmojiChallenge(challenge: EmojiDailyChallenge): ResolvedEmojiPuzzle {
  return generateEmojiPuzzle({
    date: challenge.challengeDate,
    challengeSeed: challengeSeed(challenge.challengeDate),
  });
}

export function publicEmojiChallenge(challenge: EmojiDailyChallenge): PublicEmojiChallenge {
  const puzzle = puzzleForEmojiChallenge(challenge);
  return {
    id: challenge.id,
    date: challenge.challengeDate,
    mode: "emoji",
    expiresAt: new Date(expiresAt(challenge.challengeDate)).toISOString(),
    initialEmoji: puzzle.emoji.slice(0, 2),
    maximumEmoji: puzzle.emoji.length,
  };
}

export async function emojiHints(challengeId: string, count: number): Promise<{ emoji: string[] }> {
  if (!Number.isInteger(count) || count < 3 || count > 6) throw new Error("INVALID_HINT_COUNT");
  const challenge = await database()
    .prepare(
      'SELECT id, challenge_date AS "challengeDate", mode, answer_model_id AS "answerModelId", selection_version AS "selectionVersion", generated_at AS "generatedAt", generation_source AS "generationSource" FROM daily_challenges WHERE id=? AND mode=?',
    )
    .bind(challengeId, mode)
    .first<EmojiDailyChallenge>();
  if (!challenge) throw new Error("CHALLENGE_NOT_FOUND");
  return { emoji: puzzleForEmojiChallenge(challenge).emoji.slice(0, count) };
}

export async function globalEmojiCompletionCount(challengeId: string): Promise<number> {
  const completion = await database()
    .prepare(
      "SELECT completion_count AS count FROM challenge_completion_counts WHERE challenge_id=?",
    )
    .bind(challengeId)
    .first<{ count: number }>();
  return completion?.count ?? 0;
}

let cachedDate: string | null = null;
let cachedGame: Promise<PublicEmojiGame> | null = null;

export async function emojiGameData(): Promise<PublicEmojiGame> {
  const date = utcDate();
  if (cachedDate !== date) {
    cachedDate = date;
    cachedGame = null;
  }
  if (!cachedGame) {
    cachedGame = (async () => {
      const challenge = await ensureDailyEmojiChallenge(date);
      return {
        challenge: publicEmojiChallenge(challenge),
        families: publicModelFamilies(emojiPilotPool.map((puzzle) => puzzle.familyId)),
        globalCompletionCount: await globalEmojiCompletionCount(challenge.id),
      };
    })();
  }
  try {
    return await cachedGame;
  } catch (error) {
    cachedGame = null;
    throw error;
  }
}

export async function emojiGameResponse(): Promise<Response> {
  try {
    return Response.json(await emojiGameData(), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch (error) {
    console.error("Emoji game generation failed", error);
    return Response.json(
      {
        error: {
          code: "CHALLENGE_UNAVAILABLE",
          message: "Today’s Emoji challenge is unavailable.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
