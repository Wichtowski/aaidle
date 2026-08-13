import { ensureDailyChallenge, publicChallenge } from "../../challenges/challenge-service";
import type { ClassicCategory, ClassicDifficulty } from "../../models/model-types";
import { publicModelIndexForClassic } from "../../../server/model-catalog";
import { utcDate } from "../../../utils/dates";
import { errorResponse } from "../../../validation/api";
import { globalClassicCompletionCount } from "./guess-service";

type PublicClassicGameBase = {
  challenge: ReturnType<typeof publicChallenge>;
  models: ReturnType<typeof publicModelIndexForClassic>;
};

type PublicClassicGame = PublicClassicGameBase & {
  globalCompletionCount: number;
};

let cachedDate: string | null = null;
const gamePayloads = new Map<string, Promise<PublicClassicGameBase>>();

export async function classicGameData(category: ClassicCategory, difficulty: ClassicDifficulty): Promise<PublicClassicGame> {
  const date = utcDate();
  if (cachedDate !== date) {
    cachedDate = date;
    gamePayloads.clear();
  }

  const key = `${category}:${difficulty}`;
  let payload = gamePayloads.get(key);
  if (!payload) {
    payload = (async () => {
      const challenge = publicChallenge(await ensureDailyChallenge({ date, category, difficulty }));
      return {
        challenge,
        // The complete catalogue is a module-level, server-resident index built from the seed data.
        models: publicModelIndexForClassic(category, difficulty),
      };
    })();
    gamePayloads.set(key, payload);
  }

  try {
    const game = await payload;
    return { ...game, globalCompletionCount: await globalClassicCompletionCount(game.challenge.id) };
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
