import { useEffect, useState } from "react";
import { FaEye, FaEyeSlash, FaGithub, FaGoogle } from "react-icons/fa6";
import { ApiError, apiClient } from "@lib/api/client";
import { ActivationPrompt } from "./ActivationPrompt";
import { useAuth } from "./useAuth";
import { Toast } from "../ui/Toast";

type FormMode = "sign-in" | "register";
type ToastState = { message: string; variant: "error" | "success" } | null;

export function LoginForm() {
  const { user, setAuthenticatedUser } = useAuth();
  const [mode, setMode] = useState<FormMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [localActivationUrl, setLocalActivationUrl] = useState<string | null>(null);
  const [signInErrorCode, setSignInErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canRequestEmail = Boolean(email.trim());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("activated"))
      {setToast({ message: "Your account is active. You can now sign in.", variant: "success" });}
    if (params.get("error") === "activation")
      {setToast({ message: "That activation link is invalid or expired.", variant: "error" });}
    if (params.get("error") === "reset-link")
      {setToast({ message: "That password reset link is invalid or expired.", variant: "error" });}
  }, []);

  const sendEmailRequest = async (
    request: (address: string) => Promise<{ accepted: true; activationUrl?: string }>,
    successMessage: string,
  ) => {
    setBusy(true);
    setNotice(null);
    setToast(null);
    setLocalActivationUrl(null);
    try {
      const { activationUrl } = await request(email);
      setLocalActivationUrl(activationUrl ?? null);
      if (activationUrl) setNotice("Activate your local account to complete registration.");
      else setToast({ message: successMessage, variant: "success" });
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
    if (mode === "register" && password !== confirmPassword) {
      setToast({ message: "Passwords do not match.", variant: "error" });
      return;
    }
    setBusy(true);
    setNotice(null);
    setToast(null);
    setSignInErrorCode(null);
    try {
      if (mode === "register") {
        const { activationUrl } = await apiClient.register(email, password);
        setLocalActivationUrl(activationUrl ?? null);
        if (activationUrl) setNotice("Activate your local account to complete registration.");
        else
          {setToast({ message: "Check your inbox to activate your account.", variant: "success" });}
        return;
      }
      const { user: signedInUser } = await apiClient.signInWithPassword(email, password);
      setAuthenticatedUser(signedInUser);
      window.location.assign("/profile");
    } catch (error) {
      if (mode === "sign-in")
        {setSignInErrorCode(error instanceof ApiError ? (error.code ?? "UNKNOWN") : "UNKNOWN");}
      setToast({
        message: error instanceof Error ? error.message : "Could not sign in.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onDismiss={() => setToast(null)}
      />
      {user && !user.emailVerified && user.email && <ActivationPrompt email={user.email} />}
      <div className="auth-card__providers">
        <a className="button" href="/api/v1/auth/oauth/github">
          <FaGithub aria-hidden="true" /> Continue with GitHub
        </a>
        <a className="button" href="/api/v1/auth/oauth/google">
          <FaGoogle aria-hidden="true" /> Continue with Google
        </a>
      </div>
      <div className="auth-divider">or use your email</div>
      <form className="auth-card__password" onSubmit={submitPassword}>
        <label className="auth-field">
          Email
          <input
            autoComplete="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setSignInErrorCode(null);
            }}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="auth-field">
          Password
          <span className="password-input">
            <input
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={mode === "register" ? 12 : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                setSignInErrorCode(null);
              }}
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
        {mode === "register" && (
          <label className="auth-field">
            Retype password
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
        )}
        <button className="button button--primary" disabled={busy} type="submit">
          {mode === "register" ? "Create account" : "Sign in"}
        </button>
      </form>
      {mode === "sign-in" && (
        <div className="auth-card__recovery">
          {signInErrorCode && (
            <button
              className="auth-card__toggle auth-card__toggle--right"
              disabled={busy || !canRequestEmail}
              onClick={() =>
                sendEmailRequest(
                  apiClient.requestPasswordReset.bind(apiClient),
                  "If that account exists, a password reset link is on its way.",
                )
              }
              type="button"
            >
              Forgot password?
            </button>
          )}
        </div>
      )}
      <button
        className="auth-card__toggle"
        onClick={() => {
          setMode((current) => (current === "sign-in" ? "register" : "sign-in"));
          setConfirmPassword("");
          setNotice(null);
          setToast(null);
          setLocalActivationUrl(null);
          setSignInErrorCode(null);
        }}
        type="button"
      >
        {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
      </button>
      {notice && (
        <p aria-live="polite" className="auth-card__notice">
          {notice}
        </p>
      )}
      {localActivationUrl && (
        <a className="auth-card__local-link" href={localActivationUrl}>
          Activate local account
        </a>
      )}
    </div>
  );
}
