import { applicationOrigin } from "@/lib/auth/auth-config";
import { verifyEmailAddress } from "@/lib/auth/auth-service";

const redirect = (path: string) =>
  new Response(null, { status: 303, headers: { Location: `${applicationOrigin()}${path}` } });

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || token.length > 128) return redirect("/login?error=activation");
  return redirect(
    (await verifyEmailAddress(token)) ? "/login?activated=1" : "/login?error=activation",
  );
}
