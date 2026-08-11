import type { CSSProperties, ReactNode } from "react";
import { FaArrowDown, FaArrowUp } from "react-icons/fa6";
export function ComparisonCell({
  status,
  children,
  delay = 0,
}: {
  status: string;
  children: ReactNode;
  delay?: number;
}) {
  const label =
    status === "correct"
      ? "Correct"
      : status === "partial"
        ? "Partially matches"
        : status === "higher"
          ? "Target is higher"
          : status === "lower"
            ? "Target is lower"
            : status === "unknown"
              ? "Unknown"
              : "Does not match";
  const DirectionIcon = status === "higher" ? FaArrowUp : status === "lower" ? FaArrowDown : null;
  return (
    <div
      className="comparison-card"
      role="cell"
      style={{ "--flip-delay": `${delay}ms` } as CSSProperties}
      aria-label={label}
    >
      <div className="comparison-card__inner">
        <div className="comparison-card__face comparison-card__face--cover">
          {DirectionIcon && <DirectionIcon aria-hidden focusable="false" />}
        </div>
        <div
          className={`comparison comparison--${status} comparison-card__face comparison-card__face--result`}
        >
          {DirectionIcon && <DirectionIcon aria-hidden focusable="false" />}
          <div className="comparison-card__value">{children ?? "Unknown"}</div>
        </div>
      </div>
    </div>
  );
}
