import { submitGuess } from "../../../../../lib/domain/guesses/guess-service";
import { errorResponse, parseJson } from "../../../../../lib/validation/api";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const body = await parseJson(request);
    const { challengeId } = await params;
    return Response.json(await submitGuess({ ...body, challengeId }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "DUPLICATE_GUESS")
      return errorResponse(code, "This model has already been guessed.", 409);
    if (code === "CHALLENGE_NOT_FOUND") return errorResponse(code, "Challenge not found.", 404);
    if (code === "MODEL_NOT_FOUND") return errorResponse(code, "Model not found.", 404);
    if (code === "BODY_TOO_LARGE") return errorResponse(code, "Request is too large.", 413);
    return errorResponse("INVALID_REQUEST", "The guess request is invalid.", 400);
  }
}
