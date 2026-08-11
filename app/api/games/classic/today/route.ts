import {
  ensureDailyChallenge,
  publicChallenge,
} from "../../../../../lib/domain/challenges/challenge-service";
import { utcDate } from "../../../../../lib/utils/dates";
import { errorResponse } from "../../../../../lib/validation/api";

export async function GET() {
  try {
    return Response.json(
      {
        challenge: publicChallenge(
          await ensureDailyChallenge({ date: utcDate(), mode: "classic" }),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Daily challenge generation failed", error);
    return errorResponse("CHALLENGE_UNAVAILABLE", "Today’s challenge is unavailable.", 503);
  }
}
