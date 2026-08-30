import { useState } from "react";
import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { SignOutConfirmation } from "@components/auth/SignOutConfirmation";
import { useAuth } from "@components/auth/useAuth";
import { PageEyebrow } from "@components/ui/PageEyebrow";

export function AccountDisabledPage() {
  const { signOut, user } = useAuth();
  const [signOutConfirmationOpen, setSignOutConfirmationOpen] = useState(false);
  const reason = user?.disabledReason?.trim() || "No reason was provided.";

  return (
    <AppPageLayout className="account-disabled-page">
      <section className="account-disabled-card">
        <PageEyebrow>Account unavailable</PageEyebrow>
        <h1 data-testid="account-disabled-heading">Your account has been disabled.</h1>
        <p className="account-disabled-card__reason" data-testid="account-disabled-reason">
          <strong>Reason:</strong> {reason}
        </p>
        <p>You cannot access the games or save progress with this account.</p>
        <p>Contact support if you believe this is a mistake.</p>
        <button className="button" onClick={() => setSignOutConfirmationOpen(true)} type="button">
          Sign out
        </button>
      </section>
      <SignOutConfirmation
        onClose={() => setSignOutConfirmationOpen(false)}
        onConfirm={signOut}
        open={signOutConfirmationOpen}
      />
    </AppPageLayout>
  );
}
