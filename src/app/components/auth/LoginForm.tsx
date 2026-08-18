import { useEffect, useState } from "react";
import { ApiError, apiClient } from "@lib/api/client";
import { CommonAuthForm } from "./CommonAuthForm";
import type { ToastVariant } from "../ui/Toast";

type ToastState = { message: string; variant: ToastVariant } | null;

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [localEmailActionUrl, setLocalEmailActionUrl] = useState<string | null>(null);
  const [signInErrorCode, setSignInErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialEmail = params.get("email");
    if (initialEmail) {
      setEmail(initialEmail);
    }
    if (params.has("check-activation")) {
      setToast({ message: "Check your inbox to activate your account.", variant: "success" });
    } else if (params.has("activated")) {
      setToast({ message: "Your account is active. You can now sign in.", variant: "success" });
    }

    if (params.get("error") === "activation") {
      setToast({ message: "That activation link is invalid or expired.", variant: "error" });
    }
    if (params.get("error") === "reset-link") {
      setToast({ message: "That password reset link is invalid or expired.", variant: "error" });
    }
  }, []);

  const sendPasswordReset = async () => {
    setBusy(true);
    setNotice(null);
    setToast(null);
    setLocalEmailActionUrl(null);
    try {
      const { activationUrl } = await apiClient.requestPasswordReset(email);
      setLocalEmailActionUrl(activationUrl ?? null);
      if (activationUrl) {
        setNotice("Use the local link below to reset your password.");
      } else {
        setToast({
          message: "If that account exists, a password reset link is on its way.",
          variant: "success",
        });
      }
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : "Could not send the email.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setToast(null);
    setSignInErrorCode(null);
    try {
      await apiClient.signInWithPassword(email, password);
      window.location.assign("/profile");
    } catch (error) {
      setSignInErrorCode(error instanceof ApiError ? (error.code ?? "UNKNOWN") : "UNKNOWN");
      setToast({
        message: error instanceof Error ? error.message : "Could not sign in.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CommonAuthForm
      afterForm={
        <>
          <div className="auth-card__recovery">
            {signInErrorCode && (
              <button
                className="auth-card__toggle auth-card__toggle--right"
                disabled={busy || !email.trim()}
                onClick={sendPasswordReset}
                type="button"
              >
                Forgot password?
              </button>
            )}
          </div>
          {notice && <p className="auth-card__notice">{notice}</p>}
          {localEmailActionUrl && (
            <a className="auth-card__local-link" href={localEmailActionUrl}>
              Open local email action
            </a>
          )}
        </>
      }
      busy={busy}
      email={email}
      footer={<a className="auth-card__toggle" href="/register">Need an account? Create one</a>}
      onEmailChange={(value) => {
        setEmail(value);
        setSignInErrorCode(null);
      }}
      onPasswordChange={(value) => {
        setPassword(value);
        setSignInErrorCode(null);
      }}
      onSubmit={submitPassword}
      onToastDismiss={() => setToast(null)}
      password={password}
      passwordAutoComplete="current-password"
      submitLabel="Sign in"
      toast={toast}
    />
  );
}

