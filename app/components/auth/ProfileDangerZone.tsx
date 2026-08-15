"use client";

import { useEffect, useState } from "react";
import { FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import { apiClient } from "../../../lib/api/client";
import { playerIdKey, progressKey } from "../../../lib/storage/local-progress-store";
import { useAuth } from "./useAuth";

type Confirmation = "local-data" | "account" | null;

export function ProfileDangerZone() {
  const { loading, user } = useAuth();
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmation) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) setConfirmation(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmation, sending]);

  const close = () => {
    if (sending) return;
    setConfirmation(null);
    setError(null);
    setSent(false);
  };

  const clearLocalData = () => {
    window.localStorage.removeItem(progressKey);
    window.localStorage.removeItem(playerIdKey);
    window.location.assign("/");
  };

  const requestAccountDeletion = async () => {
    setSending(true);
    setError(null);
    try {
      await apiClient.requestAccountDeletion();
      setSent(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not send the deletion email.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="danger-zone" aria-labelledby="danger-zone-title">
      <p className="eyebrow">Danger zone</p>
      <h2 id="danger-zone-title">Delete your data</h2>
      <div className="danger-zone__item">
        <div>
          <strong>Clear local data</strong>
          <p>
            Erase this browser’s saved game history, streaks, preferences, and anonymous player ID.
            Your permanent Inner Circle access remains available.
          </p>
        </div>
        <button
          className="button button--danger"
          onClick={() => setConfirmation("local-data")}
          type="button"
        >
          Clear local data
        </button>
      </div>
      {!loading && user && (
        <div className="danger-zone__item">
          <div>
            <strong>Delete account</strong>
            <p>
              Permanently delete the account for {user.email}. Confirmation is required through a
              five-minute email link.
            </p>
          </div>
          <button
            className="button button--danger"
            onClick={() => setConfirmation("account")}
            type="button"
          >
            Delete account
          </button>
        </div>
      )}

      {confirmation && (
        <div
          aria-labelledby="danger-confirmation-title"
          aria-modal="true"
          className="danger-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          role="dialog"
        >
          <section className="danger-modal__content">
            <button
              aria-label="Close confirmation"
              className="danger-modal__close"
              disabled={sending}
              onClick={close}
              type="button"
            >
              <FaXmark aria-hidden="true" />
            </button>
            <FaTriangleExclamation aria-hidden="true" className="danger-modal__icon" />
            {sent ? (
              <>
                <p className="eyebrow">Check your inbox</p>
                <h2 id="danger-confirmation-title">Deletion link sent</h2>
                <p>
                  The link sent to {user?.email} expires in five minutes. Your account is not
                  deleted until you open it.
                </p>
                <div className="danger-modal__actions">
                  <button className="button" onClick={close} type="button">
                    Done
                  </button>
                </div>
              </>
            ) : confirmation === "local-data" ? (
              <>
                <p className="eyebrow">This cannot be undone</p>
                <h2 id="danger-confirmation-title">Clear all local data?</h2>
                <p>
                  This permanently removes saved guesses, streaks, preferences, and the anonymous
                  player ID from this browser. It does not remove your permanent Inner Circle access
                  or account progress.
                </p>
                <div className="danger-modal__actions">
                  <button className="button" onClick={close} type="button">
                    Cancel
                  </button>
                  <button
                    className="button button--danger-solid"
                    onClick={clearLocalData}
                    type="button"
                  >
                    Yes, clear everything
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">Permanent account deletion</p>
                <h2 id="danger-confirmation-title">Delete your account?</h2>
                <p>
                  We will email {user?.email} a single-use confirmation link. It expires in five
                  minutes. Opening it permanently deletes your account and signs out every session.
                </p>
                {error && (
                  <p className="notice" role="alert">
                    {error}
                  </p>
                )}
                <div className="danger-modal__actions">
                  <button className="button" disabled={sending} onClick={close} type="button">
                    Cancel
                  </button>
                  <button
                    className="button button--danger-solid"
                    disabled={sending}
                    onClick={requestAccountDeletion}
                    type="button"
                  >
                    {sending ? "Sending…" : "Yes, email deletion link"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
