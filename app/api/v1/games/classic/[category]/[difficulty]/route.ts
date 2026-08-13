import { classicGameResponse } from "@/lib/domain/games/classic/classic-game-api";
import { isClassicCategory, isClassicDifficulty } from "@/lib/domain/models/model-types";
import { disabledGameAccessResponse } from "@/lib/auth/game-access";
import { hasHardcoreAccess } from "@/lib/domain/games/classic/hardcore-access";
import { errorResponse } from "@/lib/validation/api";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { cookieValue } from "@/lib/auth/auth-http";
import { userForSession } from "@/lib/auth/auth-service";

export async function GET(request: Request, { params }: { params: Promise<{ category: string; difficulty: string }> }) {
  const disabledResponse = await disabledGameAccessResponse(request);
  if (disabledResponse) return disabledResponse;
  const { category, difficulty } = await params;
  if (!isClassicCategory(category) || !isClassicDifficulty(difficulty) || (category === "hardcore") !== (difficulty === "hardcore")) {
    return new Response("Not found", { status: 404 });
  }
  if (category === "hardcore") {
    const user = await userForSession(cookieValue(request, sessionCookieName));
    if (!user) return errorResponse("UNAUTHENTICATED", "Sign in to enter Hardcore.", 401);
    if (!(await hasHardcoreAccess(user.id))) {
      return errorResponse("HARDCORE_LOCKED", "Complete the Inner Circle ritual to access Hardcore.", 403);
    }
  }
  return classicGameResponse(category, difficulty);
}
