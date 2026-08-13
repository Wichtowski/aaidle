import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { applicationOrigin, cookieAttributes, requiredAuthSecret } from "./auth-config";
import { randomToken } from "./auth-crypto";

export function cookieValue(request: Request, name: string): string | null {
  const entry = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((value) => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

export function setCookie(name: string, value: string, maxAge: number, httpOnly = true): string {
  return `${name}=${value}; ${cookieAttributes({ maxAge, httpOnly })}`;
}

export function clearCookie(name: string): string {
  return setCookie(name, "", 0);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== applicationOrigin()) throw new Error("INVALID_ORIGIN");
}

export function rateLimitSubject(request: Request, normalizedEmail: string): string {
  const clientIp = request.headers.get("x-aaidle-client-ip")?.trim() ?? "unknown";
  const trustedClientIp = isIP(clientIp) ? clientIp : "unknown";
  return createHmac("sha256", requiredAuthSecret())
    .update(`${trustedClientIp}:${normalizedEmail}`)
    .digest("base64url");
}

const stateSignature = (provider: string, state: string) =>
  createHmac("sha256", requiredAuthSecret()).update(`${provider}:${state}`).digest("base64url");

export function createOauthState(provider: string) {
  const state = randomToken();
  return { state, cookie: `${provider}.${state}.${stateSignature(provider, state)}` };
}

export function isValidOauthState(provider: string, state: string, cookie: string | null): boolean {
  const [cookieProvider, cookieState, signature] = cookie?.split(".") ?? [];
  if (cookieProvider !== provider || cookieState !== state || !signature) return false;
  const expected = stateSignature(provider, state);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
