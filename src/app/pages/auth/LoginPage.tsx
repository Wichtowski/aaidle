import { LoginForm } from "@components/auth/LoginForm";
import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { PageEyebrow } from "@components/ui/PageEyebrow";

export function LoginPage() {
  return (
    <AppPageLayout className="login-page">
      <section className="login">
        <PageEyebrow>Your aAIdle account</PageEyebrow>
        <h1 data-testid="login-heading">Keep your progress.</h1>
        <p className="lede">
          Create your aAIdle profile for account features and future game modes.
        </p>
        <LoginForm />
      </section>
    </AppPageLayout>
  );
}
