import { sendAuthEmail } from "@/lib/auth/auth-email";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { assertSameOrigin, cookieValue, rateLimitSubject } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import {
  consumeRateLimit,
  createAccountDeletionToken,
  userForSession,
} from "@/lib/auth/auth-service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await userForSession(cookieValue(request, sessionCookieName));
    if (!user) return authError("UNAUTHENTICATED", "Sign in to delete your account.", 401);

    const allowed = await consumeRateLimit({
      scope: "account-deletion",
      subjectHash: rateLimitSubject(request, user.email),
      limit: 3,
      windowMs: 60 * 60 * 1_000,
    });
    if (!allowed) return authError("RATE_LIMITED", "Try again later.", 429);

    const token = await createAccountDeletionToken(user.id);
    await sendAuthEmail({ email: user.email, purpose: "account-deletion", token });
    return Response.json(
      { accepted: true },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "EMAIL_DELIVERY_NOT_CONFIGURED" || code === "EMAIL_DELIVERY_FAILED") {
      return authError(code, "We could not send the deletion email. Try again later.", 503);
    }
    return authError("INVALID_REQUEST", "Could not request account deletion.", 400);
  }
}