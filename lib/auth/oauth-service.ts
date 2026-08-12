import { applicationOrigin } from "./auth-config";

export const oauthProviders = ["github", "google"] as const;
export type OAuthProvider = (typeof oauthProviders)[number];

type OAuthIdentity = {
  providerUserId: string;
  email: string;
  displayName: string | null;
};

type GithubProfile = { id?: unknown; name?: unknown };
type GithubEmail = { email?: unknown; primary?: unknown; verified?: unknown };
type GoogleProfile = { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown };

function credentials(provider: OAuthProvider) {
  const prefix = provider.toUpperCase();
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) throw new Error("OAUTH_NOT_CONFIGURED");
  return { clientId, clientSecret };
}

export function oauthAuthorizationUrl(provider: OAuthProvider, state: string): string {
  const { clientId } = credentials(provider);
  const redirectUri = `${applicationOrigin()}/api/v1/auth/oauth/${provider}/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  if (provider === "github") {
    params.set("scope", "read:user user:email");
    return `https://github.com/login/oauth/authorize?${params}`;
  }

  params.set("response_type", "code");
  params.set("scope", "openid email profile");
  params.set("access_type", "online");
  params.set("prompt", "select_account");
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function oauthAccessToken(provider: OAuthProvider, code: string): Promise<string> {
  const { clientId, clientSecret } = credentials(provider);
  const redirectUri = `${applicationOrigin()}/api/v1/auth/oauth/${provider}/callback`;
  const endpoint =
    provider === "github"
      ? "https://github.com/login/oauth/access_token"
      : "https://oauth2.googleapis.com/token";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      ...(provider === "google" ? { grant_type: "authorization_code" } : {}),
    }),
  });
  const data = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!response.ok || !data?.access_token) throw new Error("OAUTH_EXCHANGE_FAILED");
  return data.access_token;
}

async function githubIdentity(accessToken: string): Promise<OAuthIdentity> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const profile = (await fetch("https://api.github.com/user", { headers }).then((response) =>
    response.ok ? response.json() : null,
  )) as GithubProfile | null;
  if (!profile || typeof profile.id !== "number") throw new Error("OAUTH_PROFILE_FAILED");

  const emails = (await fetch("https://api.github.com/user/emails", { headers }).then((response) =>
    response.ok ? response.json() : null,
  )) as GithubEmail[] | null;
  const email = Array.isArray(emails)
    ? emails.find((entry) => entry.primary === true && entry.verified === true)?.email
    : null;
  if (typeof email !== "string") throw new Error("OAUTH_EMAIL_REQUIRED");
  return {
    providerUserId: String(profile.id),
    email,
    displayName: typeof profile.name === "string" ? profile.name : null,
  };
}

async function googleIdentity(accessToken: string): Promise<OAuthIdentity> {
  const profile = (await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((response) => (response.ok ? response.json() : null))) as GoogleProfile | null;
  if (
    !profile ||
    typeof profile.sub !== "string" ||
    typeof profile.email !== "string" ||
    profile.email_verified !== true
  ) {
    throw new Error("OAUTH_PROFILE_FAILED");
  }
  return {
    providerUserId: profile.sub,
    email: profile.email,
    displayName: typeof profile.name === "string" ? profile.name : null,
  };
}

export async function oauthIdentity(provider: OAuthProvider, code: string): Promise<OAuthIdentity> {
  const accessToken = await oauthAccessToken(provider, code);
  return provider === "github" ? githubIdentity(accessToken) : googleIdentity(accessToken);
}
