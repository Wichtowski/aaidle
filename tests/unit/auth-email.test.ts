import { afterEach, describe, expect, it } from "vitest";
import { authEmailLink, sendAuthEmail } from "../../lib/auth/auth-email";

const resendApiKey = process.env.RESEND_API_KEY;

afterEach(() => {
  if (resendApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = resendApiKey;
});

describe("authentication email links", () => {
  it("uses dedicated activation, password reset, and account deletion endpoints", () => {
    expect(authEmailLink("email-verification", "activation-token")).toBe(
      "http://localhost:3000/api/v1/auth/email-verification/verify?token=activation-token",
    );
    expect(authEmailLink("password-reset", "reset-token")).toBe(
      "http://localhost:3000/api/v1/auth/password-reset/verify?token=reset-token",
    );
    expect(authEmailLink("account-deletion", "deletion-token")).toBe(
      "http://localhost:3000/api/v1/auth/account-deletion/verify?token=deletion-token",
    );
  });

  it("returns an activation link locally when Resend is not configured", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      sendAuthEmail({
        email: "player@example.com",
        purpose: "email-verification",
        token: "activation-token",
      }),
    ).resolves.toEqual({
      localUrl:
        "http://localhost:3000/api/v1/auth/email-verification/verify?token=activation-token",
    });
  });
});
