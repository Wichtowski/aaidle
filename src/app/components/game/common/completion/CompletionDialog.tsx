import { useCallback, useRef, useState, type ReactNode } from "react";
import { FaXmark } from "react-icons/fa6";
import { CelebrationPhysics } from "../effects/CelebrationPhysics";

export type CompletionStat = { value: ReactNode; label: string };

export function CompletionDialog({
  actions,
  children,
  className = "",
  eyebrow,
  message,
  onCelebrationComplete,
  onClose,
  stats,
  title,
  titleId,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  eyebrow: ReactNode;
  message: ReactNode;
  onCelebrationComplete?: () => void;
  onClose: () => void;
  stats: CompletionStat[];
  title: ReactNode;
  titleId: string;
}) {
  const [open, setOpen] = useState(true);
  const modalRef = useRef<HTMLElement>(null);
  const completeCelebration = useCallback(() => onCelebrationComplete?.(), [onCelebrationComplete]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    onClose();
  };

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="completed-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      role="dialog"
    >
      <CelebrationPhysics obstacleRef={modalRef} onComplete={completeCelebration} />
      <section className={`completed ${className}`.trim()} ref={modalRef}>
        <button
          aria-label="Close completion dialog"
          className="completed__close"
          onClick={close}
          type="button"
        >
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
        <p className="completed__message">{message}</p>
        <div
          className={`completed__stats completed__stats--${stats.length}`}
          aria-label="Game result"
        >
          {stats.map((stat) => (
            <div key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
        {children}
        {actions && <div className="completed__actions">{actions}</div>}
      </section>
    </div>
  );
}
