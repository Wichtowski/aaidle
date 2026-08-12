import { clearCookie, cookieValue, assertSameOrigin } from "@/lib/auth/auth-http";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { deleteSession } from "@/lib/auth/auth-service";
import { authError } from "@/lib/auth/auth-response";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await deleteSession(cookieValue(request, sessionCookieName));
    return new Response(null, {
      status: 204,
      headers: { "Set-Cookie": clearCookie(sessionCookieName), "Cache-Control": "no-store" },
    });
  } catch {
    return authError("INVALID_REQUEST", "Could not sign out.", 400);
  }
}
