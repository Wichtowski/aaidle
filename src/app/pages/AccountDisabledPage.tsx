import { AppPageLayout } from "@app/layouts/AppPageLayout";

export default function AccountDisabledPage() {
  return (
    <AppPageLayout className="account-disabled-page">
      <section className="account-disabled-card">
        <p className="eyebrow">Account unavailable</p>
        <h1 data-testid="account-disabled-heading">Your account has been disabled.</h1>
        <p>
          You cannot access the games with this account. Contact support if you believe this is a
          mistake.
        </p>
      </section>
    </AppPageLayout>
  );
}
