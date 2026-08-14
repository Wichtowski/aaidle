import { z } from "zod";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { assertSameOrigin, cookieValue } from "@/lib/auth/auth-http";
import { userForSession } from "@/lib/auth/auth-service";
import { disabledGameAccessResponse } from "@/lib/auth/game-access";
import { database } from "@/lib/db/client";
import { hasTrajectoryAccess } from "@/lib/domain/games/classic/trajectory-access";
import { classicModeFromChallengeMode } from "@/lib/domain/models/model-types";
import { catalogModelsForClassic } from "@/lib/server/model-catalog";
import { errorResponse } from "@/lib/validation/api";
import { readRequestText } from "@/lib/validation/request-body";

const requestSchema = z.object({ trajectoryAccessToken: z.string().optional() }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    assertSameOrigin(request);
    const disabledResponse = await disabledGameAccessResponse(request);
    if (disabledResponse) return disabledResponse;

    const { challengeId } = await params;
    const body = requestSchema.parse(JSON.parse(await readRequestText(request, 8_000)));
    const challenge = await database()
      .prepare("SELECT answer_model_id, mode FROM daily_challenges WHERE id=? AND mode LIKE 'classic:%'")
      .bind(challengeId)
      .first<{ answer_model_id: string; mode: string }>();
    if (!challenge) return errorResponse("CHALLENGE_NOT_FOUND", "Challenge not found.", 404);

    const user = await userForSession(cookieValue(request, sessionCookieName));
    const completion = user
      ? await database()
          .prepare("SELECT 1 FROM user_challenge_completions WHERE user_id=? AND challenge_id=?")
          .bind(user.id, challengeId)
          .first()
      : null;
    const hasAccess = Boolean(completion) || hasTrajectoryAccess(body.trajectoryAccessToken, {
      challengeId,
      answerModelId: challenge.answer_model_id,
    });
    if (!hasAccess) {
      return errorResponse("TRAJECTORY_LOCKED", "Solve this challenge to view its model-space trajectory.", 403);
    }

    const { category, difficulty } = classicModeFromChallengeMode(challenge.mode);
    return Response.json(
      { models: catalogModelsForClassic(category, difficulty) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return errorResponse("INVALID_ORIGIN", "This request must come from the application.", 403);
    }
    return errorResponse("INVALID_REQUEST", "Could not load this model-space trajectory.", 400);
  }
}
