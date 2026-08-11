import {
  ensureDailyChallenge,
  publicChallenge,
} from "../../../../lib/domain/challenges/challenge-service";
import { utcDate } from "../../../../lib/utils/dates";
import { errorResponse } from "../../../../lib/validation/api";
export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode") ?? "classic";
  if (mode !== "classic")
    return errorResponse("UNSUPPORTED_MODE", "This mode is not available.", 400);
  try {
    return Response.json(
      { challenge: publicChallenge(await ensureDailyChallenge({ date: utcDate() })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Daily challenge generation failed", error);
    return errorResponse("CHALLENGE_UNAVAILABLE", "Today’s challenge is unavailable.", 503);
  }
}
