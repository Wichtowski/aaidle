import { sessionCookieName } from "./auth-config";
import { cookieValue } from "./auth-http";
import { isAccountDisabled, userForSession } from "./auth-service";
import { errorResponse } from "@/lib/validation/api";

export async function disabledGameAccessResponse(request: Request): Promise<Response | null> {
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user || !isAccountDisabled(user)) return null;
  return errorResponse("ACCOUNT_DISABLED", "This account has been disabled.", 403);
}
