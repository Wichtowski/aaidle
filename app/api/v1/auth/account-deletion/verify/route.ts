import {
  accountDeletionCookieName,
  accountDeletionMaxAgeSeconds,
  applicationOrigin,
} from "@/lib/auth/auth-config";
import { setCookie } from "@/lib/auth/auth-http";

const redirect = (path: string, cookie?: string) => {
  const headers = new Headers({
    Location: `${applicationOrigin()}${path}`,
    "Cache-Control": "no-store",
  });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
};

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || token.length > 128) return redirect("/profile?deletion=invalid");
  return redirect(
    "/delete-account",
    setCookie(accountDeletionCookieName, token, accountDeletionMaxAgeSeconds),
  );
}
