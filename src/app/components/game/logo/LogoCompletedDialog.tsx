import { CompletionDialog } from "../common/completion/CompletionDialog";
import type { ReactNode } from "react";

export function LogoCompletedDialog({
  answer,
  guessCount,
  clueCount,
  globalCompletionCount,
  onClose,
  shareAction,
}: {
  answer: string;
  guessCount: number;
  clueCount: number;
  globalCompletionCount: number;
  onClose: () => void;
  shareAction?: ReactNode;
}) {
  return (
    <CompletionDialog
      className="completed--logo"
      eyebrow="Logo complete"
      message="You uncovered the image and identified today’s answer."
      onClose={onClose}
      stats={[
        { value: guessCount, label: "Guesses" },
        { value: clueCount, label: "Clues unlocked" },
        { value: "Normal", label: "Difficulty" },
        { value: globalCompletionCount.toLocaleString(), label: "Global solves" },
      ]}
      title={answer}
      titleId="logo-completed-title"
      actions={shareAction}
    />
  );
}
