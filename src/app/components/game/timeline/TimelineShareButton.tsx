import { useState } from "react";
import type { TimelineDifficulty } from "@lib/domain/games/timeline/timeline-types";
import { timelineDifficultyLabel } from "@lib/domain/games/timeline/timeline-types";
import { Button } from "../../ui/Button";

export function TimelineShareButton({
  date,
  difficulty,
  attempts,
  anchorPositions,
  totalPositions,
}: {
  date: string;
  difficulty: TimelineDifficulty;
  attempts: number;
  anchorPositions: ReadonlySet<number>;
  totalPositions: number;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const timeline = Array.from({ length: totalPositions }, (_, position) =>
      anchorPositions.has(position) ? "◆" : "●",
    ).join(" ");
    const text = [
      `aAIdle Timeline ${timelineDifficultyLabel(difficulty)} - ${date}`,
      `Solved in ${attempts} submission${attempts === 1 ? "" : "s"}`,
      timeline,
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <Button onClick={() => void share()} type="button">
      {copied ? "Copied result" : "Share result"}
    </Button>
  );
}
