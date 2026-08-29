import type { EmojiDifficulty } from "@lib/api/client";
import { CompletionDialog } from "../common/completion/CompletionDialog";
import { EmojiShareButton } from "./EmojiShareButton";

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
  return (
    <CompletionDialog
      actions={<EmojiShareButton difficulty={difficulty} guessCount={guessCount} />}
      className="completed--emoji"
      eyebrow="Clues decoded"
      message={resultMessage(guessCount)}
      onClose={onClose}
      stats={[
        { value: guessCount, label: "Guesses" },
        { value: clueCount, label: "Clues used" },
        { value: difficulty, label: "Difficulty" },
        { value: globalCompletionCount.toLocaleString(), label: "Global solves" },
      ]}
      title="Excellent work."
      titleId="emoji-completed-title"
    />
  );
}
