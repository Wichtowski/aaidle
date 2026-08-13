import { sessionCookieName } from "@/lib/auth/auth-config";
import { assertSameOrigin, clearCookie } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { deleteAccountWithToken } from "@/lib/auth/auth-service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token !== "string" || !body.token || body.token.length > 128) {
      return authError("INVALID_TOKEN", "This deletion link is invalid or has expired.", 400);
    }

    const deleted = await deleteAccountWithToken(body.token);
    if (!deleted) return authError("INVALID_TOKEN", "This deletion link is invalid or has expired.", 400);

    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie": clearCookie(sessionCookieName),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return authError("INVALID_REQUEST", "Could not delete the account.", 400);
  }
}