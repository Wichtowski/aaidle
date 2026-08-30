import type { TimelineDifficulty } from "@lib/domain/games/timeline/timeline-types";
import {
  timelineDifficultyLabel,
  timelineLeaderboardPath,
} from "@lib/domain/games/timeline/timeline-types";
import { Link } from "react-router-dom";
import { CompletionDialog } from "../common/completion/CompletionDialog";
import { TimelineShareButton } from "./TimelineShareButton";

export function TimelineCompletedDialog({
  date,
  difficulty,
  attempts,
  anchorPositions,
  totalPositions,
  onClose,
  speedrunTimeMs,
}: {
  date: string;
  difficulty: TimelineDifficulty;
  attempts: number;
  anchorPositions: ReadonlySet<number>;
  totalPositions: number;
  onClose: () => void;
  speedrunTimeMs?: number;
}) {
  return (
    <CompletionDialog
      actions={
        <>
          <TimelineShareButton
            anchorPositions={anchorPositions}
            attempts={attempts}
            date={date}
            difficulty={difficulty}
            totalPositions={totalPositions}
          />
          {difficulty === "speedrun" && (
            <Link className="button" to={timelineLeaderboardPath(date)}>
              View leaderboard
            </Link>
          )}
        </>
      }
      className="completed--timeline"
      eyebrow="Timeline complete"
      message="Every model and event is exactly where it belongs."
      onClose={onClose}
      stats={[
        ...(difficulty === "speedrun"
          ? [{ value: `${((speedrunTimeMs ?? 0) / 1000).toFixed(1)}s`, label: "Time" }]
          : []),
        { value: attempts, label: "Submissions" },
        { value: totalPositions, label: "Items ordered" },
        { value: timelineDifficultyLabel(difficulty), label: "Difficulty" },
      ]}
      title="Perfect chronology."
      titleId="timeline-completed-title"
    />
  );
}
