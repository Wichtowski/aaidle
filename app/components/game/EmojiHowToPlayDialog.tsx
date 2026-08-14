"use client";

import { FaCheck, FaLightbulb, FaPen, FaXmark } from "react-icons/fa6";

export function EmojiHowToPlayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="how-to-play-modal"
      role="dialog"
      aria-labelledby="emoji-how-to-play-title"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="how-to-play-modal__content">
        <button aria-label="Close how to play" className="how-to-play-modal__close" onClick={onClose}>
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">Emoji rules</p>
        <h2 id="emoji-how-to-play-title">Decode the family.</h2>
        <p>One AI model family is hidden each day. The answer is a family such as GPT or Claude, never a specific model version.</p>

        <h3>Read the rebus</h3>
        <ul>
          <li className="how-to-play-modal__item--correct">
            <FaLightbulb aria-hidden /> Start with two emoji. They can be intentionally ambiguous.
          </li>
          <li className="how-to-play-modal__item--partial">
            <FaPen aria-hidden /> Type one family name per guess. Family names are not displayed as choices.
          </li>
          <li className="how-to-play-modal__item--incorrect">
            <FaXmark aria-hidden /> Each wrong guess unlocks the next emoji, up to six clues.
          </li>
          <li className="how-to-play-modal__item--correct">
            <FaCheck aria-hidden /> A correct family name completes today’s game.
          </li>
        </ul>

        <h3 className="how-to-play-modal__section-title">Useful details</h3>
        <ul className="how-to-play-modal__details">
          <li>Each family can be guessed only once, so use the clues to narrow the answer.</li>
          <li>Every player receives the same ordered emoji sequence for a given day.</li>
          <li>There is no guess limit. Keep decoding until the family clicks.</li>
        </ul>
        <div className="how-to-play-modal__actions">
          <button className="button button--primary" type="button" onClick={onClose}>
            Start decoding
          </button>
        </div>
      </section>
    </div>
  );
}
