import { describe, expect, it } from "vitest";
import { createOauthState, isValidOauthState } from "../../lib/auth/auth-http";

describe("OAuth state", () => {
  it("accepts only the signed cookie for the selected provider", () => {
    const { state, cookie } = createOauthState("github");

    expect(isValidOauthState("github", state, cookie)).toBe(true);
    expect(isValidOauthState("google", state, cookie)).toBe(false);
    expect(isValidOauthState("github", `${state}x`, cookie)).toBe(false);
  });
});
