import { disabledGameAccessResponse } from "@/lib/auth/game-access";
import { emojiHints } from "@/lib/domain/games/emoji/emoji-game-service";
import { errorResponse } from "@/lib/validation/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  const disabledResponse = await disabledGameAccessResponse(request);
  if (disabledResponse) return disabledResponse;
  const count = Number(new URL(request.url).searchParams.get("count"));
  try {
    const { challengeId } = await params;
    return Response.json(await emojiHints(challengeId, count), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "CHALLENGE_NOT_FOUND") return errorResponse(code, "Challenge not found.", 404);
    if (code === "INVALID_HINT_COUNT") return errorResponse(code, "Hint count must be between 3 and 6.", 400);
    return errorResponse("INVALID_REQUEST", "The hint request is invalid.", 400);
  }
}
