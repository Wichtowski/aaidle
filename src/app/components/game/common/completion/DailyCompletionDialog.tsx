import { useEffect, useRef, useState } from "react";
import { Toast } from "../../../ui/Toast";
import { dailySymbols, formatDailyShare, shareModifiers } from "@lib/domain/games/daily-completion";
import type { DailyCompletionSummary } from "@lib/validation/daily-completion";

export function DailyCompletionDialog({
  summary,
  onClose,
  onPresented,
}: {
  summary: DailyCompletionSummary;
  onClose: () => void;
  onPresented: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null,
  );
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    close.current?.focus();
    onPresented();
    return () => {
      dialog.current?.close();
      previous?.focus();
    };
  }, [onPresented]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatDailyShare(summary));
      setToast({ message: "Daily results copied.", variant: "success" });
    } catch {
      setToast({ message: "Could not copy. Select and copy the summary below.", variant: "error" });
    }
  };
  return (
    <dialog
      ref={dialog}
      className="daily-completion-dialog"
      aria-labelledby="daily-completion-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, textarea")];
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <button
        ref={close}
        type="button"
        className="completed__close"
        aria-label="Close daily summary"
        onClick={onClose}
      >
        ×
      </button>
      <p className="eyebrow">{summary.challengeDate} · All daily games complete</p>
      <h2 id="daily-completion-title">
        <span aria-hidden="true">{dailySymbols(summary)}</span> {summary.highestCompletedTier} daily
        set complete
      </h2>
      {summary.hardcoreSweep && (
        <p>GOAT achievement: every active Hardcore-capable game completed at Hardcore.</p>
      )}
      <ul className="daily-completion-results">
        {summary.groups.map((group) => (
          <li key={group.id}>
            <h3>{group.label}</h3>
            {group.modifiers.flatMap((id) =>
              shareModifiers[id]
                ? [
                    <p key={id}>
                      {shareModifiers[id]!.emoji} {shareModifiers[id]!.accessibleLabel}
                    </p>,
                  ]
                : [],
            )}
            {group.results.map((result) => (
              <p key={result.id}>
                {result.label}: <strong>{result.result}</strong>
                {result.modifiers.flatMap((id) =>
                  shareModifiers[id]
                    ? [
                        <span key={id} title={shareModifiers[id]!.accessibleLabel}>
                          {" "}
                          {shareModifiers[id]!.emoji} {shareModifiers[id]!.accessibleLabel}
                        </span>,
                      ]
                    : [],
                )}
              </p>
            ))}
          </li>
        ))}
      </ul>
      <details>
        <summary>Text summary</summary>
        <textarea
          aria-label="Spoiler-free daily results"
          readOnly
          value={formatDailyShare(summary)}
          rows={12}
        />
      </details>
      <div className="completed__actions">
        <button className="button button--primary" type="button" onClick={() => void copy()}>
          Copy results
        </button>
        <button className="button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onDismiss={() => setToast(null)}
      />
    </dialog>
  );
}
