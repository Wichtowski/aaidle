import { FaCheck, FaHardDrive, FaLightbulb, FaXmark } from "react-icons/fa6";
import { HowToPlayDialog } from "../common/dialogs/HowToPlayDialog";

export function EmojiHTP({
  hardcoreUnlocked,
  open,
  onClose,
}: {
  hardcoreUnlocked: boolean;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <HowToPlayDialog
      closeLabel="Close Emoji rules"
      description={
        <>
          Identify one hidden AI idea each day. Read the visual clues, search the answer list, then
          submit an AI system, architecture, algorithm, or operator.
        </>
      }
      eyebrow="Emoji rules"
      onClose={onClose}
      open={open}
      title="How to play"
    >
      <h3>Read the clues</h3>
      <ul>
        <li className="how-to-play-modal__item--correct">
          <FaCheck aria-hidden /> Correct — you found today’s hidden AI idea.
        </li>
        <li className="how-to-play-modal__item--incorrect">
          <FaXmark aria-hidden /> Incorrect — that answer stays in your guess history.
        </li>
        <li className="how-to-play-modal__item--direction">
          <FaLightbulb aria-hidden /> New clue — some wrong guesses reveal the next visual hint.
        </li>
      </ul>

      <h3 className="how-to-play-modal__section-title">Useful details</h3>
      <ul className="how-to-play-modal__details">
        <li>Clues may be emoji, icons, images, or visual associations.</li>
        <li>Search the displayed answer choices and submit one entity per guess.</li>
        <li>Each answer can be guessed once, so use every clue to narrow the field.</li>
        <li>
          Every player receives the same answer and ordered clue variant for the same day and
          difficulty.
        </li>
        <li>Some challenges show every clue immediately; others reveal them one at a time.</li>
        <li>Follow the association, not a letter-by-letter rebus. There is no guess limit.</li>
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
        {hardcoreUnlocked && (
          <li>
            <strong>Hardcore</strong>
            <span>
              The largest selection, unlocked by completing every Classic Challenge category.
            </span>
          </li>
        )}
      </ul>

      <p className="how-to-play-modal__privacy">
        <FaHardDrive aria-hidden="true" /> Your local guesses and progress stay in this browser.
        Signing in can synchronize them with your account.
      </p>
    </HowToPlayDialog>
  );
}
