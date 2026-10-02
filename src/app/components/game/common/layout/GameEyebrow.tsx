import type { ReactNode } from "react";
import { FadeSwap } from "../../../ui/FadeSwap";
import { PageEyebrow } from "../../../ui/PageEyebrow";
import { GameStreak } from "./GameStreak";
import type { GameFamily } from "@lib/validation/streaks";

export function GameEyebrow({
  game,
  family,
  date,
  variant,
}: {
  game: ReactNode;
  family: GameFamily;
  date: ReactNode;
  variant: ReactNode;
}) {
  return (
    <PageEyebrow>
      <FadeSwap identity={`${String(game)}:${String(date)}:${String(variant)}`}>
        {game} · {date} · {variant}
      </FadeSwap>
      <GameStreak family={family} />
    </PageEyebrow>
  );
}
