import { applicationOrigin } from "@/lib/auth/auth-config";

const redirect = (path: string) => {
  const headers = new Headers({
    Location: `${applicationOrigin()}${path}`,
    "Cache-Control": "no-store",
  });
  return new Response(null, { status: 303, headers });
};

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || token.length > 128) return redirect("/profile?deletion=invalid");
  return redirect(`/delete-account?token=${encodeURIComponent(token)}`);
}