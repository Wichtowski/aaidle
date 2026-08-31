import { FaCheck, FaEquals, FaGrip, FaHardDrive, FaLock, FaXmark } from "react-icons/fa6";
import { HowToPlayDialog } from "../common/dialogs/HowToPlayDialog";

export function TimelineHTP({
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
      closeLabel="Close Timeline rules"
      description={
        <>
          Arrange every movable AI model and event from oldest to newest. Locked anchors already sit
          in their correct positions and reveal their dates.
        </>
      }
      eyebrow="Timeline rules"
      onClose={onClose}
      open={open}
      title="How to play"
    >
      <h3>Build the timeline</h3>
      <ul>
        <li className="how-to-play-modal__item--direction">
          <FaGrip aria-hidden /> Move cards - drag them, tap a card and a position, or use arrow
          keys.
        </li>
        <li className="how-to-play-modal__item--correct">
          <FaCheck aria-hidden /> Correct - the card is in its exact chronological position.
        </li>
        <li className="how-to-play-modal__item--incorrect">
          <FaXmark aria-hidden /> Incorrect - rearrange the missed cards and submit again.
        </li>
        {hardcoreUnlocked && (
          <li className="how-to-play-modal__item--partial">
            <FaEquals aria-hidden /> Same year - the card shares a year with the correct position.
          </li>
        )}
        <li className="how-to-play-modal__item--locked">
          <FaLock aria-hidden /> Locked - anchor cards cannot be moved and always show their dates.
        </li>
      </ul>

      <h3 className="how-to-play-modal__section-title">Useful details</h3>
      <ul className="how-to-play-modal__details">
        <li>Every position must be occupied exactly once before submission.</li>
        <li>Moving any card clears old correct and incorrect feedback.</li>
        <li>Movable dates stay hidden until you solve the complete order.</li>
        <li>
          Some older scientific papers were recorded with only a publication year, so their date may
          appear as just a year.
        </li>
        <li>Normal and Challenge use non-overlapping years.</li>
        <li>Normal has 2 anchors out of 6 items. Challenge has 4 out of 12.</li>
        <li>
          Speedrun ranks fewer submissions first and adds a 5-second cooldown after each incorrect
          submission.
        </li>
        {hardcoreUnlocked && (
          <>
            <li>Hardcore has 6 anchors out of 18 and a strict 8-submission cap.</li>
            <li>
              Hardcore allows for the same year verification with the yellow highlight. <br />
              Just to make your suffering little less painful.
            </li>
          </>
        )}
      </ul>

      <p className="how-to-play-modal__privacy">
        <FaHardDrive aria-hidden="true" /> Your current arrangement stays on this device. Signing in
        synchronizes accepted submissions and completions with your account.
      </p>
    </HowToPlayDialog>
  );
}
