import { useCallback, useRef, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import type { TimelineDifficulty } from "@lib/domain/games/timeline/timeline-types";
import { timelineDifficultyLabel } from "@lib/domain/games/timeline/timeline-types";
import { CelebrationPhysics } from "./CelebrationPhysics";
import { TimelineShareButton } from "./TimelineShareButton";

export function TimelineCompletedDialog({
  date,
  difficulty,
  attempts,
  anchorPositions,
  totalPositions,
  onClose,
}: {
  date: string;
  difficulty: TimelineDifficulty;
  attempts: number;
  anchorPositions: ReadonlySet<number>;
  totalPositions: number;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const modalRef = useRef<HTMLElement>(null);
  const completeCelebration = useCallback(() => undefined, []);
  if (!open) return null;

  const close = () => {
    setOpen(false);
    onClose();
  };

  return (
    <div
      aria-labelledby="timeline-completed-title"
      aria-modal="true"
      className="completed-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      role="dialog"
    >
      <CelebrationPhysics obstacleRef={modalRef} onComplete={completeCelebration} />
      <section className="completed completed--timeline" ref={modalRef}>
        <button
          aria-label="Close completion dialog"
          className="completed__close"
          onClick={close}
          type="button"
        >
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">Timeline complete</p>
        <h2 id="timeline-completed-title">Perfect chronology.</h2>
        <p className="completed__message">Every model and event is exactly where it belongs.</p>
        <div className="completed__stats" aria-label="Your Timeline result">
          <div>
            <strong>{attempts}</strong>
            <span>Submissions</span>
          </div>
          <div>
            <strong>{totalPositions}</strong>
            <span>Items ordered</span>
          </div>
          <div>
            <strong>{timelineDifficultyLabel(difficulty)}</strong>
            <span>Difficulty</span>
          </div>
        </div>
        <div className="completed__actions">
          <TimelineShareButton
            anchorPositions={anchorPositions}
            attempts={attempts}
            date={date}
            difficulty={difficulty}
            totalPositions={totalPositions}
          />
        </div>
      </section>
    </div>
  );
}
