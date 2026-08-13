import { ResetPasswordForm } from "../components/auth/ResetPasswordForm";
import type { Metadata } from "next";
import { SiteNavbar } from "../components/ui/SiteNavbar";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <main className="page login-page">
      <SiteNavbar />
      <section className="login">
        <p className="eyebrow">Account recovery</p>
        <h1>Set a new password.</h1>
        <p className="lede">Choose a new password with at least 12 characters.</p>
        <ResetPasswordForm />
      </section>
    </main>
  );
}
