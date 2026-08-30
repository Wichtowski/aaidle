import { RegistrationForm } from "@components/auth/RegistrationForm";
import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { PageEyebrow } from "@components/ui/PageEyebrow";

export function RegisterPage() {
  return (
    <AppPageLayout className="login-page">
      <section className="login">
        <PageEyebrow>Your aAIdle account</PageEyebrow>
        <h1 data-testid="register-heading">Create your account.</h1>
        <p className="lede">Create your aAIdle profile to keep and synchronize your progress.</p>
        <RegistrationForm />
      </section>
    </AppPageLayout>
  );
}
