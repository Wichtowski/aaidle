import {
  passwordResetCookieName,
  sessionCookieName,
  sessionMaxAgeSeconds,
} from "@/lib/auth/auth-config";
import { assertSameOrigin, clearCookie, cookieValue, setCookie } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { createSession, resetPasswordWithToken } from "@/lib/auth/auth-service";
import { parseAuthJson, passwordResetCompletionSchema } from "@/lib/auth/auth-validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { password } = await parseAuthJson(request, passwordResetCompletionSchema);
    const token = cookieValue(request, passwordResetCookieName);
    if (!token) return authError("INVALID_RESET_LINK", "This password reset link is invalid or expired.", 400);

    const userId = await resetPasswordWithToken({ token, password });
    if (!userId) return authError("INVALID_RESET_LINK", "This password reset link is invalid or expired.", 400);

    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearCookie(passwordResetCookieName));
    headers.append("Set-Cookie", setCookie(sessionCookieName, await createSession(userId), sessionMaxAgeSeconds));
    return Response.json({ ok: true }, { headers });
  } catch {
    return authError("INVALID_REQUEST", "Use a password of at least 12 characters.", 400);
  }
}
