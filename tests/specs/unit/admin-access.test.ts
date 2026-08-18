import { describe, expect, it } from "vitest";
import { canManageAdministrators, canManageUsers } from "../../../src/lib/auth/permissions";

describe("admin access", () => {
  it("allows developers and super administrators to manage users", () => {
    expect(canManageUsers("user")).toBe(false);
    expect(canManageUsers("developer")).toBe(true);
    expect(canManageUsers("superadmin")).toBe(true);
  });
});

describe("administrator management", () => {
  it("reserves role and account access changes for super administrators", () => {
    expect(canManageAdministrators("user")).toBe(false);
    expect(canManageAdministrators("developer")).toBe(false);
    expect(canManageAdministrators("superadmin")).toBe(true);
  });
});
