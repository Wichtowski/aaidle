import { FaCheck, FaLightbulb, FaMagnifyingGlassMinus } from "react-icons/fa6";
import { HowToPlayDialog } from "../common/dialogs/HowToPlayDialog";

export function LogoHTP({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <HowToPlayDialog
      closeLabel="Close Logo rules"
      description="Identify today’s AI model, algorithm, or technology from a cropped or blurred image."
      eyebrow="Logo rules"
      onClose={onClose}
      open={open}
      title="How to play"
    >
      <h3>Reveal the image</h3>
      <ul>
        <li className="how-to-play-modal__item--incorrect">
          <FaMagnifyingGlassMinus aria-hidden /> Each accepted incorrect guess zooms the image out
          or reduces its blur.
        </li>
        <li className="how-to-play-modal__item--direction">
          <FaLightbulb aria-hidden /> Text and image clues unlock at their configured thresholds.
        </li>
        <li className="how-to-play-modal__item--correct">
          <FaCheck aria-hidden /> A correct guess completes today’s Logo game.
        </li>
      </ul>
      <h3 className="how-to-play-modal__section-title">Useful details</h3>
      <ul className="how-to-play-modal__details">
        <li>Some clues are available immediately; others unlock after incorrect guesses.</li>
        <li>
          Portraits may teach a formula, proof, discovery, or contribution after three misses.
        </li>
        <li>Every answer can be guessed once, and only server-confirmed guesses reveal more.</li>
        <li>Click a clue to read it. Viewed clues get a check mark and count as clues used.</li>
        <li>
          The image stops changing after the final visual reveal. A correct guess clears any
          remaining blur.
        </li>
      </ul>
    </HowToPlayDialog>
  );
}
