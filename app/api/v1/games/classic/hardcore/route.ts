import { classicGameResponse } from "../../../../../../lib/domain/games/classic/classic-game-api";
import { disabledGameAccessResponse } from "@/lib/auth/game-access";
import { hasHardcoreAccess } from "@/lib/domain/games/classic/hardcore-access";
import { errorResponse } from "@/lib/validation/api";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { cookieValue } from "@/lib/auth/auth-http";
import { userForSession } from "@/lib/auth/auth-service";

export async function GET(request: Request) {
  const disabledResponse = await disabledGameAccessResponse(request);
  if (disabledResponse) return disabledResponse;
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user) {
    return errorResponse("UNAUTHENTICATED", "Sign in to enter Hardcore.", 401);
  }
  if (!(await hasHardcoreAccess(user.id))) {
    return errorResponse(
      "HARDCORE_LOCKED",
      "Complete the Inner Circle ritual to access Hardcore.",
      403,
    );
  }
  return classicGameResponse("hardcore", "hardcore");
}
