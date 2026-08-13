import { submitClassicGuess } from "../../../../../../../../lib/domain/games/classic/guess-service";
import { errorResponse, parseJson } from "../../../../../../../../lib/validation/api";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { cookieValue } from "@/lib/auth/auth-http";
import { userForSession } from "@/lib/auth/auth-service";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const body = await parseJson(request);
    const { challengeId } = await params;
    const user = await userForSession(cookieValue(request, sessionCookieName));
    return Response.json(await submitClassicGuess({
      ...body,
      challengeId,
      completedByUserId: user?.email_verified_at ? user.id : null,
    }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "DUPLICATE_GUESS") {
      return errorResponse(code, "This model has already been guessed.", 409);
    }
    if (code === "CHALLENGE_NOT_FOUND") return errorResponse(code, "Challenge not found.", 404);
    if (code === "MODEL_NOT_FOUND") return errorResponse(code, "Model not found.", 404);
    if (code === "MODEL_NOT_AVAILABLE") {
      return errorResponse(code, "This model is not available in this difficulty.", 400);
    }
    if (code === "BODY_TOO_LARGE") return errorResponse(code, "Request is too large.", 413);
    return errorResponse("INVALID_REQUEST", "The guess request is invalid.", 400);
  }
}
