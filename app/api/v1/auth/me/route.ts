import { cookieValue } from "@/lib/auth/auth-http";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { userForSession } from "@/lib/auth/auth-service";

export async function GET(request: Request) {
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user) {
    return Response.json(
      { user: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        emailVerified: Boolean(user.email_verified_at),
        permission: user.permission,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
