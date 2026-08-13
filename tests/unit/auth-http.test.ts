import { describe, expect, it } from "vitest";
import { assertSameOrigin, rateLimitSubject } from "../../lib/auth/auth-http";

describe("same-origin request validation", () => {
  it("requires the configured origin for state-changing requests", () => {
    expect(() => assertSameOrigin(new Request("http://localhost:3000/api/v1/auth/logout"))).toThrow(
      "INVALID_ORIGIN",
    );
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000/api/v1/auth/logout", {
          headers: { Origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
});

describe("rate-limit subjects", () => {
  it("uses only the trusted Caddy client-IP header", () => {
    const trustedIp = "203.0.113.10";
    const request = new Request("http://localhost:3000/api/v1/auth/password", {
      headers: {
        "X-Aaidle-Client-Ip": trustedIp,
        "X-Forwarded-For": "198.51.100.20",
      },
    });
    const forgedForwardedIp = new Request("http://localhost:3000/api/v1/auth/password", {
      headers: {
        "X-Aaidle-Client-Ip": trustedIp,
        "X-Forwarded-For": "192.0.2.30",
      },
    });

    expect(rateLimitSubject(request, "player@example.com")).toBe(
      rateLimitSubject(forgedForwardedIp, "player@example.com"),
    );
  });
});
