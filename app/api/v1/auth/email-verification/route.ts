import { sendAuthEmail } from "@/lib/auth/auth-email";
import { assertSameOrigin, rateLimitSubject } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { consumeRateLimit, createEmailVerificationTokenForEmail } from "@/lib/auth/auth-service";
import { emailRequestSchema, parseAuthJson } from "@/lib/auth/auth-validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email } = await parseAuthJson(request, emailRequestSchema);
    const allowed = await consumeRateLimit({
      scope: "email-verification",
      subjectHash: rateLimitSubject(request, email),
      limit: 3,
      windowMs: 60 * 60 * 1_000,
    });
    if (!allowed) return authError("RATE_LIMITED", "Try again later.", 429);

    const verification = await createEmailVerificationTokenForEmail(email);
    if (verification) {
      await sendAuthEmail({
        email: verification.email,
        purpose: "email-verification",
        token: verification.token,
      });
    }
    return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "EMAIL_DELIVERY_NOT_CONFIGURED" || code === "EMAIL_DELIVERY_FAILED") {
      return authError(code, "We could not send the activation email. Try again later.", 503);
    }
    return authError("INVALID_REQUEST", "Enter a valid email address.", 400);
  }
}
