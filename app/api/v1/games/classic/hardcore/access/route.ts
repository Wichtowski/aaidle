import { sessionCookieName } from "@/lib/auth/auth-config";
import { assertSameOrigin, cookieValue } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { isAccountDisabled, userForSession } from "@/lib/auth/auth-service";
import { grantHardcoreAccess, hasHardcoreAccess } from "@/lib/domain/games/classic/hardcore-access";
import { hasCompletedChallengeRitual } from "@/lib/domain/games/classic/hardcore-unlock";
import { localProgressSchema } from "@/lib/storage/local-progress-schema";
import { errorResponse } from "@/lib/validation/api";
import { readRequestText } from "@/lib/validation/request-body";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await userForSession(cookieValue(request, sessionCookieName));
    if (!user) return authError("UNAUTHENTICATED", "Sign in to enter Hardcore.", 401);
    if (isAccountDisabled(user))
      return authError("ACCOUNT_DISABLED", "This account has been disabled.", 403);

    if (!(await hasHardcoreAccess(user.id))) {
      const progress = localProgressSchema.parse(
        JSON.parse(await readRequestText(request, 1_000_000)),
      );
      const today = new Date().toISOString().slice(0, 10);
      if (!progress.preferences.hardcoreUnlocked && !hasCompletedChallengeRitual(progress, today)) {
        return errorResponse(
          "RITUAL_INCOMPLETE",
          "Complete all six Challenge boards today to enter Hardcore.",
          403,
        );
      }
      await grantHardcoreAccess(user.id);
    }

    return Response.json({ unlocked: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return errorResponse("INVALID_ORIGIN", "This request must come from the application.", 403);
    }
    return errorResponse("INVALID_REQUEST", "Could not unlock Hardcore access.", 400);
  }
}
