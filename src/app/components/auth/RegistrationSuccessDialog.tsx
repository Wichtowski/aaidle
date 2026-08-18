import { useEffect, useRef } from "react";

export function RegistrationSuccessDialog({
  activationUrl,
  email,
}: {
  activationUrl: string | null;
  email: string;
}) {
  const continueRef = useRef<HTMLAnchorElement>(null);
  const loginUrl = `/login?${new URLSearchParams({
    email,
    "check-activation": "1",
  }).toString()}`;

  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  return (
    <div
      aria-describedby="registration-success-description"
      aria-labelledby="registration-success-title"
      aria-modal="true"
      className="auth-success-modal"
      role="dialog"
    >
      <section className="auth-success-modal__content">
        <p className="eyebrow">Account created</p>
        <h2 id="registration-success-title">Check your inbox.</h2>
        <p id="registration-success-description">
          We sent an activation link to <strong>{email}</strong>. Activate your account before
          signing in.
        </p>
        {activationUrl && (
          <a className="auth-card__local-link" href={activationUrl}>
            Activate local account
          </a>
        )}
        <div className="auth-success-modal__actions">
          <a className="button button--primary" href={loginUrl} ref={continueRef}>
            Continue to sign in
          </a>
        </div>
      </section>
    </div>
  );
}
