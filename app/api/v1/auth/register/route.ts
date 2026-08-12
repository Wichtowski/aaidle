import { sessionCookieName, sessionMaxAgeSeconds } from "@/lib/auth/auth-config";
import { assertSameOrigin, rateLimitSubject, setCookie } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { consumeRateLimit, createSession, registerWithPassword } from "@/lib/auth/auth-service";
import { parseAuthJson, passwordRegistrationSchema } from "@/lib/auth/auth-validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email, password } = await parseAuthJson(request, passwordRegistrationSchema);
    const allowed = await consumeRateLimit({
      scope: "register",
      subjectHash: rateLimitSubject(request, email),
      limit: 3,
      windowMs: 60 * 60 * 1_000,
    });
    if (!allowed) return authError("RATE_LIMITED", "Try again later.", 429);

    const user = await registerWithPassword({ email, password });
    return Response.json(
      { user: { id: user.id, email: user.email, displayName: user.display_name } },
      {
        status: 201,
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
    if (code === "ACCOUNT_EXISTS") return authError(code, "An account with this email already exists.", 409);
    if (code === "AUTH_NOT_CONFIGURED") {
      return authError(code, "Account sign-in is not configured yet.", 503);
    }
    return authError("INVALID_REQUEST", "Use a valid email and a password of at least 12 characters.", 400);
  }
}
