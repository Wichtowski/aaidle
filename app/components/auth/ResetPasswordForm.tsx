"use client";

import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { Toast } from "../ui/Toast";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
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
        <span className="password-input">
          <input
            autoComplete="new-password"
            minLength={12}
            onChange={(event) => setPassword(event.target.value)}
            required
            type={passwordVisible ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            className="password-input__toggle"
            onClick={() => setPasswordVisible((visible) => !visible)}
            type="button"
          >
            {passwordVisible ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
          </button>
        </span>
      </label>
      <label className="auth-field">
        Retype new password
        <span className="password-input">
          <input
            autoComplete="new-password"
            minLength={12}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type={confirmPasswordVisible ? "text" : "password"}
            value={confirmPassword}
          />
          <button
            aria-label={confirmPasswordVisible ? "Hide retyped password" : "Show retyped password"}
            className="password-input__toggle"
            onClick={() => setConfirmPasswordVisible((visible) => !visible)}
            type="button"
          >
            {confirmPasswordVisible ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
          </button>
        </span>
      </label>
      <button className="button button--primary" disabled={busy || !password || !confirmPassword} type="submit">
        Set new password
      </button>
    </form>
  );
}
