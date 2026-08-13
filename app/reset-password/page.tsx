import { ResetPasswordForm } from "../components/auth/ResetPasswordForm";
import { SiteNavbar } from "../components/ui/SiteNavbar";

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
