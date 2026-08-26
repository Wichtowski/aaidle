import type { ReactNode } from "react";
import { FadeSwap } from "../../../ui/FadeSwap";

export function GameEyebrow({
  game,
  date,
  variant,
}: {
  game: ReactNode;
  date: ReactNode;
  variant: ReactNode;
}) {
  return (
    <p className="eyebrow">
      <FadeSwap identity={`${String(game)}:${String(date)}:${String(variant)}`}>
        {game} · {date} · {variant}
      </FadeSwap>
    </p>
  );
}
