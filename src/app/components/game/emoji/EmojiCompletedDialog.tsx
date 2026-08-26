import { useCallback, useRef, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import type { EmojiDifficulty } from "@lib/api/client";
import { CelebrationPhysics } from "../common/effects/CelebrationPhysics";

function resultMessage(guessCount: number) {
  if (guessCount === 1) return "One guess. Either genius or delightfully suspicious.";
  if (guessCount <= 2) return "Two guesses. You’re a master!";
  if (guessCount <= 3) return "You read those clues like a native language.";
  if (guessCount <= 6) return "Nicely decoded. Every clue led you closer.";
  return "Solved. The detour only made the reveal more satisfying.";
}

export function EmojiCompletedDialog({
  difficulty,
  guessCount,
  clueCount,
  globalCompletionCount,
  onClose,
}: {
  difficulty: EmojiDifficulty;
  guessCount: number;
  clueCount: number;
  globalCompletionCount: number;
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
      className="completed-modal"
      role="dialog"
      aria-labelledby="emoji-completed-title"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <CelebrationPhysics obstacleRef={modalRef} onComplete={completeCelebration} />
      <section className="completed completed--emoji" ref={modalRef}>
        <button
          aria-label="Close completion dialog"
          className="completed__close"
          onClick={close}
          type="button"
        >
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">Clues decoded</p>
        <h2 id="emoji-completed-title">Excellent work.</h2>
        <p className="completed__message">{resultMessage(guessCount)}</p>
        <div className="completed__stats" aria-label="Your Emoji result">
          <div>
            <strong>{guessCount}</strong>
            <span>Guesses</span>
          </div>
          <div>
            <strong>{clueCount}</strong>
            <span>Clues used</span>
          </div>
          <div>
            <strong>{difficulty}</strong>
            <span>Difficulty</span>
          </div>
          <div>
            <strong>{globalCompletionCount.toLocaleString()}</strong>
            <span>Global solves</span>
          </div>
        </div>
      </section>
    </div>
  );
}
