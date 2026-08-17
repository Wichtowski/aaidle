import { useState } from "react";
import { FaTriangleExclamation } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { apiClient } from "@lib/api/client";

export default function DeleteAccountPage() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await apiClient.completeAccountDeletion();
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
        <p className="eyebrow">Final confirmation</p>
        <h1>Delete your account?</h1>
        <p>
          This permanently deletes your account, linked identities, active sessions, and unused
          authentication links. This cannot be undone.
        </p>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="danger-modal__actions">
          <Link className="button" to="/profile">
            Cancel
          </Link>
          <button
            className="button button--danger-solid"
            disabled={deleting}
            onClick={() => void deleteAccount()}
            type="button"
          >
            {deleting ? "Deleting…" : "Permanently delete account"}
          </button>
        </div>
      </section>
    </AppPageLayout>
  );
}
