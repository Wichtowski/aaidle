import { oauthStateCookieName } from "@/lib/auth/auth-config";
import { createOauthState, setCookie } from "@/lib/auth/auth-http";
import {
  oauthAuthorizationUrl,
  oauthProviders,
  type OAuthProvider,
} from "@/lib/auth/oauth-service";

const isProvider = (value: string): value is OAuthProvider =>
  oauthProviders.includes(value as OAuthProvider);

export async function GET(_: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });

  try {
    const { state, cookie } = createOauthState(provider);
    return new Response(null, {
      status: 302,
      headers: {
        Location: oauthAuthorizationUrl(provider, state),
        "Set-Cookie": setCookie(oauthStateCookieName, cookie, 10 * 60),
      },
    });
  } catch {
    return new Response("Sign-in provider is not configured.", { status: 503 });
  }
}
