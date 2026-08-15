import {
  applicationOrigin,
  oauthStateCookieName,
  sessionCookieName,
  sessionMaxAgeSeconds,
} from "@/lib/auth/auth-config";
import { clearCookie, cookieValue, isValidOauthState, setCookie } from "@/lib/auth/auth-http";
import { findOrCreateOauthUser, createSession, isAccountDisabled } from "@/lib/auth/auth-service";
import { oauthIdentity, oauthProviders, type OAuthProvider } from "@/lib/auth/oauth-service";

const isProvider = (value: string): value is OAuthProvider =>
  oauthProviders.includes(value as OAuthProvider);

const redirect = (path: string, session?: string) => {
  const headers = new Headers({ Location: `${applicationOrigin()}${path}` });
  headers.append("Set-Cookie", clearCookie(oauthStateCookieName));
  if (session)
    headers.append("Set-Cookie", setCookie(sessionCookieName, session, sessionMaxAgeSeconds));
  return new Response(null, { status: 303, headers });
};

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (
    !isProvider(provider) ||
    !state ||
    !code ||
    !isValidOauthState(provider, state, cookieValue(request, oauthStateCookieName))
  ) {
    return redirect("/login?error=oauth");
  }

  try {
    const identity = await oauthIdentity(provider, code);
    const user = await findOrCreateOauthUser({ provider, ...identity });
    if (isAccountDisabled(user)) return redirect("/account-disabled");
    return redirect("/classic", await createSession(user.id));
  } catch {
    return redirect("/login?error=oauth");
  }
}
