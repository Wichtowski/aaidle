import { LoginForm } from "../components/auth/LoginForm";
import { SiteNavbar } from "../components/ui/SiteNavbar";

export default function LoginPage() {
  return (
    <main className="page login-page">
      <SiteNavbar />
      <section className="login">
        <p className="eyebrow">Your aAidle account</p>
        <h1>Keep your progress.</h1>
        <p className="lede">Create your aAidle profile for account features and future game modes.</p>
        <LoginForm />
      </section>
    </main>
  );
}
