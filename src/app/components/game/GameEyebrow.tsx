import type { ReactNode } from "react";

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
      {game} · {date} · {variant}
    </p>
  );
}
