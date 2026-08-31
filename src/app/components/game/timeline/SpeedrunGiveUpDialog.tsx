import { useEffect, useRef, useState } from "react";

export function SpeedrunGiveUpDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      aria-describedby="speedrun-give-up-description"
      aria-labelledby="speedrun-give-up-title"
      aria-modal="true"
      className="danger-modal speedrun-give-up-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      role="dialog"
    >
      <section className="danger-modal__content">
        <p className="eyebrow">Speedrun</p>
        <h2 id="speedrun-give-up-title">Give up this Speedrun?</h2>
        <p id="speedrun-give-up-description">
          This run will be marked unfinished and cannot be resumed or submitted.
        </p>
        <div className="danger-modal__actions">
          <button
            className="button"
            disabled={busy}
            onClick={onClose}
            ref={cancelRef}
            type="button"
          >
            Keep playing
          </button>
          <button
            className="button button--danger-solid"
            disabled={busy}
            onClick={() => void confirm()}
            type="button"
          >
            {busy ? "Giving up…" : "Give up Speedrun"}
          </button>
        </div>
      </section>
    </div>
  );
}
