import type { ReactNode } from "react";
import { FadeSwap } from "../../../ui/FadeSwap";
import { PageEyebrow } from "../../../ui/PageEyebrow";

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
    <PageEyebrow>
      <FadeSwap identity={`${String(game)}:${String(date)}:${String(variant)}`}>
        {game} · {date} · {variant}
      </FadeSwap>
    </PageEyebrow>
  );
}
