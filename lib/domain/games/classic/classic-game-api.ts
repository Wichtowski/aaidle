import { ensureDailyChallenge, publicChallenge } from "../../challenges/challenge-service";
import type { ClassicCategory, ClassicDifficulty } from "../../models/model-types";
import { publicModelIndexForClassic } from "../../../server/model-catalog";
import { utcDate } from "../../../utils/dates";
import { errorResponse } from "../../../validation/api";

type PublicClassicGame = {
  challenge: ReturnType<typeof publicChallenge>;
  models: ReturnType<typeof publicModelIndexForClassic>;
};

let cachedDate: string | null = null;
const gamePayloads = new Map<string, Promise<PublicClassicGame>>();

export async function classicGameData(category: ClassicCategory, difficulty: ClassicDifficulty): Promise<PublicClassicGame> {
  const date = utcDate();
  if (cachedDate !== date) {
    cachedDate = date;
    gamePayloads.clear();
  }

  const key = `${category}:${difficulty}`;
  let payload = gamePayloads.get(key);
  if (!payload) {
    payload = (async () => ({
      challenge: publicChallenge(await ensureDailyChallenge({ date, category, difficulty })),
      // The complete catalogue is a module-level, server-resident index built from the seed data.
      models: publicModelIndexForClassic(category, difficulty),
    }))();
    gamePayloads.set(key, payload);
  }

  try {
    return await payload;
  } catch (error) {
    gamePayloads.delete(key);
    throw error;
  }
}

export async function classicGameResponse(category: ClassicCategory, difficulty: ClassicDifficulty): Promise<Response> {
  try {
    return Response.json(await classicGameData(category, difficulty), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Classic game generation failed", error);
    return errorResponse("CHALLENGE_UNAVAILABLE", "Today’s challenge is unavailable.", 503);
  }
}
