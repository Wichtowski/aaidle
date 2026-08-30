import { describe, expect, it } from "vitest";
import { isValidUsername, usernamePattern } from "../../../src/lib/auth/username";

describe("username validation", () => {
  it("uses a valid HTML Unicode Sets pattern", () => {
    expect(() => new RegExp(usernamePattern, "v")).not.toThrow();
  });

  it("matches the server username character policy", () => {
    expect(isValidUsername("runner-name_1")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("runner name")).toBe(false);
    expect(isValidUsername("runner🔥")).toBe(false);
  });
});
