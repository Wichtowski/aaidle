import { useEffect, useState } from "react";
import { FaTriangleExclamation } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { PageEyebrow } from "@components/ui/PageEyebrow";
import { apiClient } from "@lib/api/client";
import { Button } from "@components/ui/Button";
import { resetProgressAfterSignOut } from "@lib/storage/local-progress-store";

export function DeleteAccountPage() {
  const navigate = useNavigate();
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiClient
      .accountDeletionStatus()
      .then((status) => {
        if (!active) return;
        if (!status.authorized || !status.maskedEmail || !status.expiresAt) {
          navigate("/profile?deletion=invalid", { replace: true });
          return;
        }
        setMaskedEmail(status.maskedEmail);
        setExpiresAt(status.expiresAt);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not verify the deletion link.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const phrase = maskedEmail ? `DELETE ${maskedEmail}` : "";
  const deleteAccount = async () => {
    if (confirmation !== phrase) return;
    setDeleting(true);
    setError(null);
    try {
      await apiClient.completeAccountDeletion(confirmation);
      resetProgressAfterSignOut();
      window.location.assign("/?account-deleted=true");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not delete the account.",
      );
      setDeleting(false);
    }
  };

  return (
    <AppPageLayout className="prose delete-account-page">
      <section className="delete-account-card">
        <FaTriangleExclamation aria-hidden />
        <PageEyebrow>Final confirmation</PageEyebrow>
        <h1 data-testid="delete-account-heading">Delete your account?</h1>
        {!maskedEmail && !error && <p>Verifying your single-use deletion link…</p>}
        {maskedEmail && (
          <>
            <p>
              This permanently deletes the account for <strong>{maskedEmail}</strong>, including
              linked identities, active sessions, and unused authentication links. This cannot be
              undone. The authorization expires at{" "}
              {expiresAt ? new Date(expiresAt).toLocaleTimeString() : "shortly"}.
            </p>
            <label htmlFor="account-deletion-confirmation">
              Enter <strong>{phrase}</strong> to continue
            </label>
            <input
              autoComplete="off"
              data-testid="delete-account-confirmation"
              id="account-deletion-confirmation"
              onChange={(event) => setConfirmation(event.target.value)}
              spellCheck={false}
              value={confirmation}
            />
          </>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="danger-modal__actions">
          <Button data-testid="delete-account-cancel" to="/profile">
            Cancel
          </Button>
          <Button
            variant="primary"
            color="danger"
            data-testid="delete-account-confirm"
            disabled={deleting || confirmation !== phrase || !maskedEmail}
            onClick={() => void deleteAccount()}
            type="button"
          >
            {deleting ? "Deleting…" : "Permanently delete account"}
          </Button>
        </div>
      </section>
    </AppPageLayout>
  );
}
