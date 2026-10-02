import type { ReactNode } from "react";
import { FadeSwap } from "../../../ui/FadeSwap";
import { PageEyebrow } from "../../../ui/PageEyebrow";
import { GameStreak } from "./GameStreak";
import type { GameFamily } from "@lib/validation/streaks";
import { GameDateNavigation } from "./GameDateNavigation";
import { DailySummaryButton } from "../completion/DailySummaryButton";

export function GameEyebrow({
  game,
  family,
  date,
  variant,
  historyPath,
}: {
  game: ReactNode;
  family: GameFamily;
  date: ReactNode;
  variant: ReactNode;
  historyPath?: string;
}) {
  return (
    <PageEyebrow>
      <FadeSwap identity={`${String(game)}:${String(date)}:${String(variant)}`}>
        {game} ·{" "}
        {typeof date === "string" ? (
          <GameDateNavigation date={date} basePath={historyPath ?? `/${family}`} />
        ) : (
          date
        )}{" "}
        · {variant}
      </FadeSwap>
      <GameStreak family={family} />
      <DailySummaryButton date={typeof date === "string" ? date : undefined} />
    </PageEyebrow>
  );
}
