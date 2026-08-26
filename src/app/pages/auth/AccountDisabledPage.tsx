import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { useAuth } from "@components/auth/useAuth";

export default function AccountDisabledPage() {
  const { signOut, user } = useAuth();
  const reason = user?.disabledReason?.trim() || "No reason was provided.";

  return (
    <AppPageLayout className="account-disabled-page">
      <section className="account-disabled-card">
        <p className="eyebrow">Account unavailable</p>
        <h1 data-testid="account-disabled-heading">Your account has been disabled.</h1>
        <p className="account-disabled-card__reason" data-testid="account-disabled-reason">
          <strong>Reason:</strong> {reason}
        </p>
        <p>You cannot access the games or save progress with this account.</p>
        <p>Contact support if you believe this is a mistake.</p>
        <button className="button" onClick={() => void signOut()} type="button">
          Sign out
        </button>
      </section>
    </AppPageLayout>
  );
}
