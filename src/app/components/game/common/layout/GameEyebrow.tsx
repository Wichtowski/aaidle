import type { ReactNode } from "react";
import { FadeSwap } from "../../../ui/FadeSwap";
import { PageEyebrow } from "../../../ui/PageEyebrow";
import { GameStreak } from "./GameStreak";
import { gameFamilies } from "@lib/validation/streaks";

export function GameEyebrow({
  game,
  date,
  variant,
}: {
  game: ReactNode;
  date: ReactNode;
  variant: ReactNode;
}) {
  const family = gameFamilies.find((family) => family === String(game).toLowerCase());
  return (
    <PageEyebrow>
      <FadeSwap identity={`${String(game)}:${String(date)}:${String(variant)}`}>
        {game} · {date} · {variant}
      </FadeSwap>
      {family && <GameStreak family={family} />}
    </PageEyebrow>
  );
}
