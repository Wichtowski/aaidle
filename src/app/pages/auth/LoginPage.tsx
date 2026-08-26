import { LoginForm } from "@components/auth/LoginForm";
import { AppPageLayout } from "@app/layouts/AppPageLayout";

export default function LoginPage() {
  return (
    <AppPageLayout className="login-page">
      <section className="login">
        <p className="eyebrow">Your aAIdle account</p>
        <h1 data-testid="login-heading">Keep your progress.</h1>
        <p className="lede">
          Create your aAIdle profile for account features and future game modes.
        </p>
        <LoginForm />
      </section>
    </AppPageLayout>
  );
}
