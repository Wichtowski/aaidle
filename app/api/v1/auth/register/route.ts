import { sendAuthEmail } from "@/lib/auth/auth-email";
import { assertSameOrigin, rateLimitSubject } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import {
  consumeRateLimit,
  createEmailVerificationToken,
  registerWithPassword,
} from "@/lib/auth/auth-service";
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
    const delivery = await sendAuthEmail({
      email: user.email,
      purpose: "email-verification",
      token: await createEmailVerificationToken(user.id),
    });
    return Response.json(
      { accepted: true, activationUrl: delivery.localUrl },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "ACCOUNT_EXISTS") {
      return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    if (code === "AUTH_NOT_CONFIGURED") {
      return authError(code, "Account sign-in is not configured yet.", 503);
    }
    if (code === "EMAIL_DELIVERY_NOT_CONFIGURED" || code === "EMAIL_DELIVERY_FAILED") {
      return authError(code, "We could not send the activation email. Try again later.", 503);
    }
    return authError("INVALID_REQUEST", "Use a valid email and a password of at least 12 characters.", 400);
  }
}
