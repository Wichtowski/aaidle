"use client";

import { useState } from "react";
import { FaTriangleExclamation } from "react-icons/fa6";
import { SiteNavbar } from "../components/ui/SiteNavbar";

export default function DeleteAccountPage() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteAccount = async () => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError("This deletion link is invalid or has expired.");
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/account-deletion/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Could not delete the account.");
      }
      window.location.assign("/?account-deleted=true");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete the account.");
      setDeleting(false);
    }
  };

  return (
    <main className="page prose delete-account-page">
      <SiteNavbar />
      <section className="delete-account-card" aria-labelledby="delete-account-title">
        <FaTriangleExclamation aria-hidden="true" />
        <p className="eyebrow">Final confirmation</p>
        <h1 id="delete-account-title">Delete your account?</h1>
        <p>This permanently deletes your account, linked identities, active sessions, and unused authentication links. This cannot be undone.</p>
        {error && <p className="notice" role="alert">{error}</p>}
        <div className="danger-modal__actions">
          <a className="button" href="/profile">Cancel</a>
          <button className="button button--danger-solid" disabled={deleting} onClick={deleteAccount} type="button">
            {deleting ? "Deleting…" : "Permanently delete account"}
          </button>
        </div>
      </section>
    </main>
  );
}