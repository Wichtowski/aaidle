"use client";

import { useState } from "react";
import { Toast } from "../ui/Toast";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [toast, setToast] = useState<{ message: string; variant: "error" } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setToast({ message: "Passwords do not match.", variant: "error" });
      return;
    }

    setBusy(true);
    setToast(null);
    try {
      const response = await fetch("/api/v1/auth/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not reset your password.");
      window.location.assign("/classic");
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not reset your password.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-card auth-card__password" onSubmit={submit}>
      <Toast message={toast?.message ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <label className="auth-field">
        New password
        <input
          autoComplete="new-password"
          minLength={12}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      <label className="auth-field">
        Retype new password
        <input
          autoComplete="new-password"
          minLength={12}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </label>
      <button className="button button--primary" disabled={busy || !password || !confirmPassword} type="submit">
        Set new password
      </button>
    </form>
  );
}
