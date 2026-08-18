import { useState, type ReactNode } from "react";
import { FaEye, FaEyeSlash, FaGithub, FaGoogle } from "react-icons/fa6";
import { ActivationPrompt } from "./ActivationPrompt";
import { useAuth } from "./useAuth";
import { Toast, type ToastVariant } from "../ui/Toast";

type CommonAuthFormProps = {
  afterForm?: ReactNode;
  busy: boolean;
  children?: ReactNode;
  email: string;
  footer: ReactNode;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  password: string;
  passwordAutoComplete: "current-password" | "new-password";
  passwordMinLength?: number;
  submitLabel: string;
  toast: { message: string; variant: ToastVariant } | null;
  onToastDismiss: () => void;
};

export function CommonAuthForm({
  afterForm,
  busy,
  children,
  email,
  footer,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  password,
  passwordAutoComplete,
  passwordMinLength,
  submitLabel,
  toast,
  onToastDismiss,
}: CommonAuthFormProps) {
  const { user } = useAuth();
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <div className="auth-card">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onDismiss={onToastDismiss} />
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
      <form className="auth-card__password" onSubmit={onSubmit}>
        <label className="auth-field">
          Email
          <input
            autoComplete="email"
            onChange={(event) => onEmailChange(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="auth-field">
          Password
          <span className="password-input">
            <input
              autoComplete={passwordAutoComplete}
              minLength={passwordMinLength}
              onChange={(event) => onPasswordChange(event.target.value)}
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
        {children}
        <button className="button button--primary" disabled={busy} type="submit">
          {submitLabel}
        </button>
      </form>
      {afterForm}
      {footer}
    </div>
  );
}
