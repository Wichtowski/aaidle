import { cookieValue } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { userForSession } from "@/lib/auth/auth-service";

export async function GET(request: Request) {
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user) return authError("UNAUTHENTICATED", "Sign in to access this resource.", 401);
  return Response.json(
    { user: { id: user.id, email: user.email, displayName: user.display_name } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
