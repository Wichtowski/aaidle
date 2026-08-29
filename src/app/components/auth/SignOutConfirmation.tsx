import { useEffect, useRef, useState } from "react";

export function SignOutConfirmation({
  onClose,
  onConfirm,
  open,
}: {
  onClose: () => void;
  onConfirm: () => Promise<void>;
  open: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const signingOutRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError(null);
    cancelRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !signingOutRef.current) onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  const confirm = async () => {
    signingOutRef.current = true;
    setSigningOut(true);
    setError(null);

    try {
      await onConfirm();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Could not sign out.");
      signingOutRef.current = false;
      setSigningOut(false);
    }
  };

  return (
    <div
      aria-describedby="sign-out-confirmation-description"
      aria-labelledby="sign-out-confirmation-title"
      aria-modal="true"
      className="danger-modal sign-out-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget && !signingOut) onClose();
      }}
      role="dialog"
    >
      <section className="danger-modal__content">
        <p className="eyebrow">Sign out</p>
        <h2 id="sign-out-confirmation-title">Are you sure you want to sign out?</h2>
        <p id="sign-out-confirmation-description">
          You will need to sign in again to access your account.
        </p>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="danger-modal__actions">
          <button
            className="button"
            disabled={signingOut}
            onClick={onClose}
            ref={cancelRef}
            type="button"
          >
            Cancel
          </button>
          <button
            className="button button--primary"
            disabled={signingOut}
            onClick={() => void confirm()}
            type="button"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>
    </div>
  );
}
