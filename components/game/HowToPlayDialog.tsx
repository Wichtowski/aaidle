"use client";

import {
  FaArrowDown,
  FaArrowUp,
  FaCheck,
  FaEquals,
  FaHardDrive,
  FaQuestion,
  FaXmark,
} from "react-icons/fa6";

export function HowToPlayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="how-to-play-modal"
      role="dialog"
      aria-labelledby="how-to-play-title"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="how-to-play-modal__content">
        <button
          aria-label="Close how to play"
          className="how-to-play-modal__close"
          onClick={onClose}
        >
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">Classic rules</p>
        <h2 id="how-to-play-title">How to play</h2>
        <p>
          Identify one hidden AI model each day. Start typing to search the full model catalogue,
          then submit a model to reveal how its public attributes compare with the answer.
        </p>

        <h3>Read the clues</h3>
        <ul>
          <li className="how-to-play-modal__item--correct">
            <FaCheck aria-hidden /> Exact match — this attribute matches the hidden model.
          </li>
          <li className="how-to-play-modal__item--partial">
            <FaEquals aria-hidden /> Overlap — a multi-value field shares at least one value.
          </li>
          <li className="how-to-play-modal__item--incorrect">
            <FaXmark aria-hidden /> No match — this attribute does not match.
          </li>
          <li className="how-to-play-modal__item--direction">
            <FaArrowUp aria-hidden /> <FaArrowDown aria-hidden /> Direction — the hidden model is
            newer/older or has a larger/smaller context window.
          </li>
          <li className="how-to-play-modal__item--unknown">
            <FaQuestion aria-hidden /> Unknown — there is not enough reliable data to compare.
          </li>
        </ul>

        <h3 className="how-to-play-modal__section-title">Useful details</h3>
        <ul className="how-to-play-modal__details">
          <li>
            Bold text inside categories, input, output, and use cases marks the exact overlap.
          </li>
          <li>Year · Q means the release year and quarter, so arrows help narrow the date.</li>
          <li>
            Provider country, open/local availability, reasoning, and context window are all useful
            ways to eliminate models.
          </li>
          <li>Previously guessed models stay visible but cannot be submitted again.</li>
        </ul>

        <h3 className="how-to-play-modal__section-title">Your data</h3>
        <p className="how-to-play-modal__privacy">
          <FaHardDrive aria-hidden="true" /> Until you sign in, your guesses, streak, and statistics
          are saved only in this browser on this device. They are never stored in our database.
          Clearing browser or site data removes them. Account sync will be available after sign in.
        </p>

        <p className="how-to-play-modal__tip">
          There is no guess limit: follow the clues, keep narrowing, and protect your streak.
        </p>
      </section>
    </div>
  );
}
