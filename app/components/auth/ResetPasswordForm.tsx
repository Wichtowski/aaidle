"use client";

import { useState } from "react";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setNotice("Passwords do not match.");
      return;
    }

    setBusy(true);
    setNotice(null);
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
      setNotice(error instanceof Error ? error.message : "Could not reset your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-card auth-card__password" onSubmit={submit}>
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
      {notice && <p aria-live="polite" className="auth-card__notice">{notice}</p>}
    </form>
  );
}
