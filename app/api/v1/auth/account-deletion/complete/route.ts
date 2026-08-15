import { accountDeletionCookieName, sessionCookieName } from "@/lib/auth/auth-config";
import { assertSameOrigin, clearCookie, cookieValue } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { deleteAccountWithToken } from "@/lib/auth/auth-service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const token = cookieValue(request, accountDeletionCookieName);
    if (!token || token.length > 128) {
      return authError("INVALID_TOKEN", "This deletion link is invalid or has expired.", 400);
    }

    const deleted = await deleteAccountWithToken(token);
    if (!deleted)
      return authError("INVALID_TOKEN", "This deletion link is invalid or has expired.", 400);

    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearCookie(accountDeletionCookieName));
    headers.append("Set-Cookie", clearCookie(sessionCookieName));
    return new Response(null, { status: 204, headers });
  } catch {
    return authError("INVALID_REQUEST", "Could not delete the account.", 400);
  }
}
