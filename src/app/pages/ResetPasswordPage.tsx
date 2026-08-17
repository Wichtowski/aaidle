import { ResetPasswordForm } from "@components/auth/ResetPasswordForm";
import { AppPageLayout } from "@app/layouts/AppPageLayout";

export default function ResetPasswordPage() {
  return (
    <AppPageLayout className="login-page">
      <section className="login">
        <p className="eyebrow">Account recovery</p>
        <h1>Set a new password.</h1>
        <p className="lede">Choose a new password with at least 12 characters.</p>
        <ResetPasswordForm />
      </section>
    </AppPageLayout>
  );
}
