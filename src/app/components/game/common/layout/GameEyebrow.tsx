import type { ReactNode } from "react";
import { FadeSwap } from "../../../ui/FadeSwap";
import { PageEyebrow } from "../../../ui/PageEyebrow";
import { GameStreak } from "./GameStreak";
import { gameFamilies } from "@lib/validation/streaks";
import { GameDateNavigation } from "./GameDateNavigation";
import { DailySummaryButton } from "../completion/DailySummaryButton";

export function GameEyebrow({
  game,
  date,
  variant,
  historyPath,
}: {
  game: ReactNode;
  date: ReactNode;
  variant: ReactNode;
  historyPath?: string;
}) {
  const family = gameFamilies.find((family) => family === String(game).toLowerCase());
  return (
    <PageEyebrow>
      <FadeSwap identity={`${String(game)}:${String(date)}:${String(variant)}`}>
        {game} ·{" "}
        {family && typeof date === "string" ? (
          <GameDateNavigation date={date} basePath={historyPath ?? `/${family}`} />
        ) : (
          date
        )}{" "}
        · {variant}
      </FadeSwap>
      {family && <GameStreak family={family} />}
      {family && <DailySummaryButton date={typeof date === "string" ? date : undefined} />}
    </PageEyebrow>
  );
}
