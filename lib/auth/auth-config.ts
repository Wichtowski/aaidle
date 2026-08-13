const isProduction = process.env.NODE_ENV === "production";

export const sessionCookieName = "aaidle_session";
export const oauthStateCookieName = "aaidle_oauth_state";
export const passwordResetCookieName = "aaidle_password_reset";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;
export const passwordResetMaxAgeSeconds = 15 * 60;

export function applicationOrigin(): string {
  const configured = process.env.APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  if (isProduction) throw new Error("APP_ORIGIN is required in production");
  return "http://localhost:3000";
}

export function requiredAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction) throw new Error("AUTH_NOT_CONFIGURED");
  return "local-development-auth-secret-not-for-production";
}

export function cookieAttributes({ maxAge, httpOnly = true }: { maxAge: number; httpOnly?: boolean }) {
  return [
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    ...(httpOnly ? ["HttpOnly"] : []),
    ...(isProduction ? ["Secure"] : []),
  ].join("; ");
}
