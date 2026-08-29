import type { TimelineDifficulty } from "@lib/domain/games/timeline/timeline-types";
import { timelineDifficultyLabel } from "@lib/domain/games/timeline/timeline-types";
import { CompletionDialog } from "../common/completion/CompletionDialog";
import { TimelineShareButton } from "./TimelineShareButton";

export function TimelineCompletedDialog({
  date,
  difficulty,
  attempts,
  anchorPositions,
  totalPositions,
  onClose,
}: {
  date: string;
  difficulty: TimelineDifficulty;
  attempts: number;
  anchorPositions: ReadonlySet<number>;
  totalPositions: number;
  onClose: () => void;
}) {
  return (
    <CompletionDialog
      actions={
        <TimelineShareButton
          anchorPositions={anchorPositions}
          attempts={attempts}
          date={date}
          difficulty={difficulty}
          totalPositions={totalPositions}
        />
      }
      className="completed--timeline"
      eyebrow="Timeline complete"
      message="Every model and event is exactly where it belongs."
      onClose={onClose}
      stats={[
        { value: attempts, label: "Submissions" },
        { value: totalPositions, label: "Items ordered" },
        { value: timelineDifficultyLabel(difficulty), label: "Difficulty" },
      ]}
      title="Perfect chronology."
      titleId="timeline-completed-title"
    />
  );
}
