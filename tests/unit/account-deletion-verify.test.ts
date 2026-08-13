import { describe, expect, it } from "vitest";
import { GET } from "../../app/api/v1/auth/account-deletion/verify/route";

describe("account deletion verification", () => {
  it("moves the confirmation token into an HttpOnly cookie before redirecting", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/v1/auth/account-deletion/verify?token=deletion-token"),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/delete-account");
    expect(response.headers.get("set-cookie")).toContain("aaidle_account_deletion=deletion-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
});
