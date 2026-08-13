import { describe, expect, it } from "vitest";
import { canManageUsers } from "../../lib/auth/permissions";

describe("admin access", () => {
  it("allows developers and super administrators to manage users", () => {
    expect(canManageUsers("user")).toBe(false);
    expect(canManageUsers("developer")).toBe(true);
    expect(canManageUsers("superadmin")).toBe(true);
  });
});
