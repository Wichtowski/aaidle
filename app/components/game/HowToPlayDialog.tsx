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
import type { ClassicCategory } from "../../../lib/domain/models/model-types";

export function HowToPlayDialog({
  category,
  open,
  onClose,
}: {
  category: ClassicCategory;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  const hardcore = category === "hardcore";

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
        <p className="eyebrow">{hardcore ? "Infernal rules" : "Classic rules"}</p>
        <h2 id="how-to-play-title">{hardcore ? "How to survive" : "How to play"}</h2>
        <p>
          {hardcore
            ? "One hidden model waits somewhere in the entire catalogue. Offer a guess and pray the clues spare your soul."
            : "Identify one hidden AI model each day. Start typing to search the full model catalogue, then submit a model to reveal how its public attributes compare with the answer."}
        </p>

        <h3>{hardcore ? "Read the omens" : "Read the clues"}</h3>
        <ul>
          <li className="how-to-play-modal__item--correct">
            <FaCheck aria-hidden /> {hardcore ? "Blessed green — an exact match. Take the tiny mercy." : "Exact match — this attribute matches the hidden model."}
          </li>
          <li className="how-to-play-modal__item--partial">
            <FaEquals aria-hidden /> {hardcore ? "No half-measures here. Only exact matches are blessed." : "Overlap — a multi-value field shares at least one value."}
          </li>
          <li className="how-to-play-modal__item--incorrect">
            <FaXmark aria-hidden /> {hardcore ? "Red means wrong. The underworld has logged it." : "No match — this attribute does not match."}
          </li>
          <li className="how-to-play-modal__item--direction">
            <FaArrowUp aria-hidden /> <FaArrowDown aria-hidden /> {hardcore ? "The arrows have abandoned you." : "Direction — the hidden model is newer/older by release date, including its quarter, or has a larger/smaller context window."}
          </li>
          <li className="how-to-play-modal__item--unknown">
            <FaQuestion aria-hidden /> {hardcore ? "N/A — even damnation has exceptions." : "N/A — this attribute does not apply to that kind of model."}
          </li>
        </ul>

        <h3 className="how-to-play-modal__section-title">{hardcore ? "Rules of the pit" : "Useful details"}</h3>
        <ul className="how-to-play-modal__details">
          <li>
            {hardcore ? "Categories reveal only a strict yes or no. The pit deals only in certainty." : "Bold text inside categories, input, output, and use cases marks the exact overlap."}
          </li>
          <li>{hardcore ? "Release, context, and every other clue offer no directional mercy." : "Release compares both year and quarter, so arrows help narrow the date precisely."}</li>
          <li>
            {hardcore ? "Every AI model category is in play. Guess widely; despair efficiently." : "Provider country, open/local availability, reasoning, and context window are all useful ways to eliminate models."}
          </li>
          <li>{hardcore ? "Previously guessed models remain as a monument to your suffering." : "Previously guessed models stay visible but cannot be submitted again."}</li>
        </ul>

        <h3 className="how-to-play-modal__section-title">Choose your difficulty</h3>
        <p className="how-to-play-modal__modes-intro">Choose a focused category, then decide how broad you want today’s search to be.</p>
        <ul className="how-to-play-modal__modes">
          <li>
            <strong>Normal</strong>
            <span>A focused pool within the selected category.</span>
          </li>
          <li>
            <strong>Challenge</strong>
            <span>A broader pool within the selected category, including every Normal candidate.</span>
          </li>
          {hardcore && (
            <li>
              <strong>Hardcore</strong>
              <span>The complete catalogue across every category. Only exact matches are green.</span>
            </li>
          )}
        </ul>

        <h3 className="how-to-play-modal__section-title">Your data</h3>
        <p className="how-to-play-modal__privacy">
          <FaHardDrive aria-hidden="true" /> Until you sign in, your guesses, streak, and statistics
          are saved only in this browser on this device. They are never stored in our database.
          Clearing browser or site data removes them. Account sync will be available after sign in.
        </p>

        <p className="how-to-play-modal__tip">
          {hardcore ? "There is no guess limit. The pit is patient; be more patient." : "There is no guess limit: follow the clues, keep narrowing, and protect your streak."}
        </p>
        <div className="how-to-play-modal__actions">
          <button className="button button--primary" type="button" onClick={onClose}>
            {hardcore ? "Enter the fire" : "Got it"}
          </button>
        </div>
      </section>
    </div>
  );
}
