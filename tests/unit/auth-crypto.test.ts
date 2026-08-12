import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../lib/auth/auth-crypto";

describe("password hashing", () => {
  it("stores a salted scrypt hash and verifies only the original password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});
