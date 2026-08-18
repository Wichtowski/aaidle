import { RegistrationForm } from "@components/auth/RegistrationForm";
import { AppPageLayout } from "@app/layouts/AppPageLayout";

export default function RegisterPage() {
  return (
    <AppPageLayout className="login-page">
      <section className="login">
        <p className="eyebrow">Your aAIdle account</p>
        <h1>Create your account.</h1>
        <p className="lede">Create your aAIdle profile to keep and synchronize your progress.</p>
        <RegistrationForm />
      </section>
    </AppPageLayout>
  );
}
