import { cookies } from "next/headers";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { userForSession } from "@/lib/auth/auth-service";
import { SiteNavbar } from "../components/ui/SiteNavbar";

export default async function AccountDisabledPage() {
  const session = (await cookies()).get(sessionCookieName)?.value ?? null;
  const user = await userForSession(session);

  return (
    <main className="page account-disabled-page">
      <SiteNavbar />
      <section className="account-disabled-card">
        <p className="eyebrow">Account unavailable</p>
        <h1>Your account has been disabled.</h1>
        <p>
          You cannot access the games with this account. Contact support if you believe this is a
          mistake.
        </p>
        {user?.disabled_reason && (
          <p>
            <strong>Administrator note:</strong> {user.disabled_reason}
          </p>
        )}
      </section>
    </main>
  );
}
