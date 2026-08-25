import { useEffect, useId, useRef, type ReactNode } from "react";
import { FaXmark } from "react-icons/fa6";

export type HowToPlayDialogProps = {
  actionLabel?: string;
  children: ReactNode;
  closeLabel?: string;
  description: ReactNode;
  eyebrow: ReactNode;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
};

export function HowToPlayDialog({
  actionLabel = "Got it",
  children,
  closeLabel = "Close how to play",
  description,
  eyebrow,
  onClose,
  open,
  title,
}: HowToPlayDialogProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };

    closeButtonRef.current?.focus();
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="how-to-play-modal"
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="how-to-play-modal__content">
        <button
          ref={closeButtonRef}
          aria-label={closeLabel}
          className="how-to-play-modal__close"
          onClick={onClose}
          type="button"
        >
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>

        {children}

        <div className="how-to-play-modal__actions">
          <button className="button button--primary" type="button" onClick={onClose}>
            {actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
