"use client";

import { useState } from "react";
import { apiClient } from "../../../lib/api/client";
import { Toast } from "../ui/Toast";

export function ActivationPrompt({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);

  const sendActivationEmail = async () => {
    setBusy(true);
    setNotice(null);
    setToast(null);
    setActivationUrl(null);
    try {
      const delivery = await apiClient.resendActivationEmail(email);
      setActivationUrl(delivery.activationUrl ?? null);
      if (delivery.activationUrl) setNotice("Activate your local account to continue.");
      else setToast({ message: "Activation email sent. Check your inbox.", variant: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not send the activation email.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account-activation" aria-labelledby="account-activation-title">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <div>
        <p className="eyebrow">Account activation</p>
        <h2 id="account-activation-title">Activate your account</h2>
        <p>To use all account features, activate the email address for {email}.</p>
      </div>
      <div className="account-activation__actions">
        <button className="button button--primary" disabled={busy} onClick={sendActivationEmail} type="button">
          {busy ? "Sending…" : "Send activation email"}
        </button>
        {notice && <p aria-live="polite" className="account-activation__notice">{notice}</p>}
        {activationUrl && (
          <a className="account-activation__link" href={activationUrl}>
            Activate local account
          </a>
        )}
      </div>
    </section>
  );
}
