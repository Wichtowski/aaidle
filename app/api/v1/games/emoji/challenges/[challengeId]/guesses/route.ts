import { disabledGameAccessResponse } from "@/lib/auth/game-access";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { cookieValue } from "@/lib/auth/auth-http";
import { userForSession } from "@/lib/auth/auth-service";
import { submitEmojiGuess } from "@/lib/domain/games/emoji/emoji-guess-service";
import { errorResponse, parseEmojiGuess } from "@/lib/validation/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const disabledResponse = await disabledGameAccessResponse(request);
    if (disabledResponse) return disabledResponse;
    const body = await parseEmojiGuess(request);
    const { challengeId } = await params;
    const user = await userForSession(cookieValue(request, sessionCookieName));
    return Response.json(
      await submitEmojiGuess({ ...body, challengeId, completedByUserId: user?.id ?? null }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "CHALLENGE_NOT_FOUND") return errorResponse(code, "Challenge not found.", 404);
    if (code === "FAMILY_NOT_AVAILABLE") {
      return errorResponse(code, "This family is not in the Emoji answer pool.", 400);
    }
    if (code === "BODY_TOO_LARGE") return errorResponse(code, "Request is too large.", 413);
    return errorResponse("INVALID_REQUEST", "The guess request is invalid.", 400);
  }
}
