import { applicationOrigin, isProduction } from "./auth-config";

type EmailPurpose = "email-verification" | "password-reset" | "account-deletion";

export type AuthEmailDelivery = {
  localUrl?: string;
};

const sender = "aAidle <accounts@aaidle.com>";

function resendApiKey() {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey;
}

export function authEmailLink(purpose: EmailPurpose, token: string) {
  const path =
    purpose === "email-verification"
      ? "/api/v1/auth/email-verification/verify"
      : purpose === "password-reset"
        ? "/api/v1/auth/password-reset/verify"
        : "/api/v1/auth/account-deletion/verify";
  return `${applicationOrigin()}${path}?token=${encodeURIComponent(token)}`;
}

export async function sendAuthEmail({
  email,
  purpose,
  token,
}: {
  email: string;
  purpose: EmailPurpose;
  token: string;
}): Promise<AuthEmailDelivery> {
  const isVerification = purpose === "email-verification";
  const isDeletion = purpose === "account-deletion";
  const link = authEmailLink(purpose, token);
  const subject = isVerification
    ? "Activate your aAIdle account"
    : isDeletion
      ? "Confirm deletion of your aAIdle account"
      : "Reset your aAIdle password";
  const action = isVerification
    ? "Activate account"
    : isDeletion
      ? "Delete account"
      : "Reset password";
  const expiry = isVerification ? "30 minutes" : isDeletion ? "5 minutes" : "15 minutes";
  const warning = isDeletion ? " This permanently deletes your account and cannot be undone." : "";
  const apiKey = resendApiKey();
  if (!apiKey) {
    if (!isProduction) return { localUrl: link };
    throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      "User-Agent": "aAidle/1.0",
    },
    body: JSON.stringify({
      from: sender,
      to: [email],
      subject,
      text: `${action}: ${link}\n\nThis link expires in ${expiry}.${warning}`,
      html: `<p><a href="${link}">${action}</a></p><p>This link expires in ${expiry}.${warning}</p>`,
    }),
  });

  if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED");
  return {};
}
