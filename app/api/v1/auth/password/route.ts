import { sessionCookieName, sessionMaxAgeSeconds } from "@/lib/auth/auth-config";
import { assertSameOrigin, rateLimitSubject, setCookie } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { authenticateWithPassword, consumeRateLimit, createSession } from "@/lib/auth/auth-service";
import { parseAuthJson, passwordLoginSchema } from "@/lib/auth/auth-validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email, password } = await parseAuthJson(request, passwordLoginSchema);
    const allowed = await consumeRateLimit({
      scope: "password-login",
      subjectHash: rateLimitSubject(request, email),
      limit: 10,
      windowMs: 15 * 60 * 1_000,
    });
    if (!allowed) return authError("RATE_LIMITED", "Try again later.", 429);

    const user = await authenticateWithPassword({ email, password });
    return Response.json(
      { user: { id: user.id, email: user.email, displayName: user.display_name } },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": setCookie(
            sessionCookieName,
            await createSession(user.id),
            sessionMaxAgeSeconds,
          ),
        },
      },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "EMAIL_UNVERIFIED") {
      return authError(code, "Activate your account from the email before signing in.", 403);
    }
    if (code === "INVALID_CREDENTIALS") {
      return authError(code, "Email or password is incorrect.", 401);
    }
    if (code === "AUTH_NOT_CONFIGURED") {
      return authError(code, "Account sign-in is not configured yet.", 503);
    }
    return authError("INVALID_REQUEST", "Enter your email and password.", 400);
  }
}
