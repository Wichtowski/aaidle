"use client";

import { useRef, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import { CelebrationPhysics } from "./CelebrationPhysics";

type EmojiGuess = {
  isCorrect: boolean;
};

function resultMessage(guessCount: number) {
  if (guessCount === 1) return "One guess...";
  if (guessCount <= 3) return "Sharp decoding. The clues barely had time to unfold.";
  if (guessCount <= 6) return "Excellent work. You followed the signals home.";
  return "Solved. Every wrong turn still revealed something useful.";
}

export function EmojiCompletedDialog({
  familyName,
  guesses,
  onClose,
}: {
  familyName: string;
  guesses: EmojiGuess[];
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const modalRef = useRef<HTMLElement>(null);
  const wrongGuesses = guesses.filter((guess) => !guess.isCorrect).length;
  const cluesRevealed = Math.min(6, 2 + wrongGuesses);

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
      <CelebrationPhysics obstacleRef={modalRef} onComplete={() => undefined} />
      <section className="completed" ref={modalRef}>
        <button aria-label="Close completion dialog" className="completed__close" onClick={close}>
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">Emoji identified</p>
        <h2 id="emoji-completed-title">{familyName}</h2>
        <p className="completed__message">{resultMessage(guesses.length)}</p>
        <div className="completed__stats" aria-label="Your Emoji game statistics">
          <div>
            <strong>{guesses.length}</strong>
            <span>Guesses</span>
          </div>
          <div>
            <strong>{cluesRevealed}</strong>
            <span>Clues used</span>
          </div>
        </div>
      </section>
    </div>
  );
}
