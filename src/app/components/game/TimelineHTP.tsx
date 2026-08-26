import { FaCheck, FaGrip, FaHardDrive, FaLock, FaXmark } from "react-icons/fa6";
import { HowToPlayDialog } from "./HowToPlayDialog";

export function TimelineHTP({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        <li>
          <FaLock aria-hidden /> Locked - anchor cards cannot be moved and always show their dates.
        </li>
      </ul>

      <h3 className="how-to-play-modal__section-title">Useful details</h3>
      <ul className="how-to-play-modal__details">
        <li>Every position must be occupied exactly once before submission.</li>
        <li>Moving any card clears old correct and incorrect feedback.</li>
        <li>Movable dates stay hidden until you solve the complete order.</li>
        <li>Normal has 2 anchors out of 6 items. Challenge has 3 out of 9.</li>
        <li>Hardcore has 4 anchors out of 12 and a strict submission cap shown in the game.</li>
        <li>Hardcore unlocks through the same Classic Challenge ritual as Emoji Clues.</li>
      </ul>

      <p className="how-to-play-modal__privacy">
        <FaHardDrive aria-hidden="true" /> Your current arrangement stays on this device. Signing in
        synchronizes accepted submissions and completions with your account.
      </p>
    </HowToPlayDialog>
  );
}
