import { ensureDailyChallenge, publicChallenge } from "../../challenges/challenge-service";
import type { ClassicDifficulty } from "../../models/model-types";
import { publicModelIndexByDifficulty } from "../../../server/model-catalog";
import { utcDate } from "../../../utils/dates";
import { errorResponse } from "../../../validation/api";

export async function classicGameResponse(difficulty: ClassicDifficulty): Promise<Response> {
  try {
    return Response.json(
      {
        challenge: publicChallenge(await ensureDailyChallenge({ date: utcDate(), difficulty })),
        models: publicModelIndexByDifficulty[difficulty],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Classic game generation failed", error);
    return errorResponse("CHALLENGE_UNAVAILABLE", "Today’s challenge is unavailable.", 503);
  }
}
