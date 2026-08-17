import { FaCheck, FaHardDrive, FaXmark } from "react-icons/fa6";

export function EmojiCluesHowToPlayDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="how-to-play-modal"
      role="dialog"
      aria-labelledby="emoji-clues-how-to-play-title"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="how-to-play-modal__content">
        <button
          aria-label="Close Emoji Clues rules"
          className="how-to-play-modal__close"
          onClick={onClose}
          type="button"
        >
          <FaXmark aria-hidden focusable="false" />
        </button>
        <p className="eyebrow">Emoji Clues rules</p>
        <h2 id="emoji-clues-how-to-play-title">Decode the clues</h2>
        <p>
          One AI idea is hidden each day. The answer can be an AI system, architecture, algorithm,
          or operator—not a model family or a specific model version.
        </p>

        <h3>Read the visual clues</h3>
        <ul className="how-to-play-modal__details">
          <li>
            Start with the clues shown for today. They may be emoji, icons, or visual associations.
          </li>
          <li>Search the displayed answer choices and submit one entity per guess.</li>
          <li>
            Each accepted wrong guess unlocks another clue in progressive challenges, up to the
            displayed maximum.
          </li>
          <li>
            Some challenges reveal all their clues immediately. A correct entity completes today’s
            game.
          </li>
        </ul>

        <h3 className="how-to-play-modal__section-title">Useful details</h3>
        <ul className="how-to-play-modal__details">
          <li>Each entity can be guessed once, so use every clue to narrow the field.</li>
          <li>
            Every player receives the same answer and ordered clue variant for the same day and
            difficulty.
          </li>
          <li>
            There is no guess limit. Keep connecting the associations until the answer clicks.
          </li>
        </ul>

        <h3 className="how-to-play-modal__section-title">Choose your difficulty</h3>
        <ul className="how-to-play-modal__modes">
          <li>
            <strong>Normal</strong>
            <span>A focused selection of AI ideas.</span>
          </li>
          <li>
            <strong>Challenge</strong>
            <span>A broader selection, including every Normal candidate.</span>
          </li>
          <li>
            <strong>Hardcore</strong>
            <span>
              The largest selection, unlocked by completing every Classic Challenge category.
            </span>
          </li>
        </ul>

        <p className="how-to-play-modal__privacy">
          <FaHardDrive aria-hidden="true" /> Your local guesses and progress stay in this browser.
          Signing in can synchronize them with your account.
        </p>
        <p className="how-to-play-modal__tip">
          <FaCheck aria-hidden /> Follow the association, not a letter-by-letter rebus.
        </p>
        <div className="how-to-play-modal__actions">
          <button className="button button--primary" type="button" onClick={onClose}>
            Got it
          </button>
        </div>
      </section>
    </div>
  );
}
