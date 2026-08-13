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
      windowMs: 5 * 60 * 1_000,
    });
    if (!allowed) {
      return authError(
        "RATE_LIMITED",
        "Too many sign-in attempts. Please wait a few minutes before trying again.",
        429,
      );
    }

    const user = await authenticateWithPassword({ email, password });
    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          emailVerified: Boolean(user.email_verified_at),
          permission: user.permission,
        },
      },
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
    if (code === "INVALID_CREDENTIALS") {
      return authError(code, "Email or password is incorrect.", 401);
    }
    if (code === "AUTH_NOT_CONFIGURED") {
      return authError(code, "Account sign-in is not configured yet.", 503);
    }
    return authError("INVALID_REQUEST", "Enter your email and password.", 400);
  }
}
