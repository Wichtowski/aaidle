import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { apiClient } from "@lib/api/client";
import { CommonAuthForm } from "./CommonAuthForm";
import { RegistrationSuccessDialog } from "./RegistrationSuccessDialog";
import type { ToastVariant } from "../ui/Toast";

type ToastState = { message: string; variant: ToastVariant } | null;

export function RegistrationForm() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ email: string; activationUrl: string | null } | null>(
    null,
  );

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setToast({ message: "Passwords do not match.", variant: "error" });
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      const { activationUrl } = await apiClient.register(email, password, username);
      setSuccess({ email, activationUrl: activationUrl ?? null });
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : "Could not create the account.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {success && (
        <RegistrationSuccessDialog activationUrl={success.activationUrl} email={success.email} />
      )}
      <CommonAuthForm
        busy={busy}
        email={email}
        footer={
          <a className="auth-card__toggle" href="/login">
            Already have an account? Sign in
          </a>
        }
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={submit}
        onToastDismiss={() => setToast(null)}
        password={password}
        passwordAutoComplete="new-password"
        passwordMinLength={12}
        submitLabel="Create account"
        toast={toast}
        toolDescription="Create a new aAIdle account with an email address and password."
        toolName="createAccount"
      >
        <label className="auth-field">
          <span className="auth-field__label">Username <small>(optional)</small></span>
          <input
            autoComplete="username"
            data-testid="register-username"
            maxLength={24}
            minLength={3}
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            pattern="[A-Za-z0-9_-]{3,24}"
            toolparamdescription="The optional public leaderboard username."
            type="text"
            value={username}
          />
        </label>
        <label className="auth-field">
          Retype password
          <span className="password-input">
            <input
              autoComplete="new-password"
              data-testid="register-confirm-password"
              minLength={12}
              name="confirmPassword"
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              toolparamdescription="The password entered again for confirmation."
              type={confirmPasswordVisible ? "text" : "password"}
              value={confirmPassword}
            />
            <button
              aria-label={
                confirmPasswordVisible ? "Hide retyped password" : "Show retyped password"
              }
              className="password-input__toggle"
              onClick={() => setConfirmPasswordVisible((visible) => !visible)}
              type="button"
            >
              {confirmPasswordVisible ? (
                <FaEyeSlash aria-hidden="true" />
              ) : (
                <FaEye aria-hidden="true" />
              )}
            </button>
          </span>
        </label>
      </CommonAuthForm>
    </>
  );
}
