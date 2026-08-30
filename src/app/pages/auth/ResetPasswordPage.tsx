import { ResetPasswordForm } from "@components/auth/ResetPasswordForm";
import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { PageEyebrow } from "@components/ui/PageEyebrow";

export function ResetPasswordPage() {
  return (
    <AppPageLayout className="login-page">
      <section className="login">
        <PageEyebrow>Account recovery</PageEyebrow>
        <h1 data-testid="reset-password-heading">Set a new password.</h1>
        <p className="lede">Choose a new password with at least 12 characters.</p>
        <ResetPasswordForm />
      </section>
    </AppPageLayout>
  );
}
