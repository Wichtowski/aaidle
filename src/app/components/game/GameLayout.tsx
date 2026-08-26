import type { ReactNode } from "react";
import { DailyCountdown } from "./DailyCountdown";

export function GameIntro({
  eyebrow,
  title,
  titleId,
  description,
  expiresAt,
  onExpiry,
  completionCount,
  navigation,
  difficulty,
  input,
  status,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  titleId?: string;
  description: ReactNode;
  expiresAt: string | null;
  onExpiry?: () => void;
  completionCount?: number | null;
  navigation?: ReactNode;
  difficulty?: ReactNode;
  input?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <section className="game-intro" aria-labelledby={titleId}>
      <div className="game-intro__meta">
        {eyebrow}
        <div className="game-intro__timing">
          {expiresAt && <DailyCountdown expiresAt={expiresAt} onExpiry={onExpiry} />}
          {completionCount !== null && completionCount !== undefined && (
            <p className="game-intro__completed">{completionCount} completed</p>
          )}
        </div>
      </div>
      <h1 data-testid="game-heading" id={titleId}>
        {title}
      </h1>
      <p className="lede">{description}</p>
      {navigation}
      {difficulty}
      {input}
      {status}
    </section>
  );
}
