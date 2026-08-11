import type { CSSProperties, ReactNode } from "react";
import { FaArrowDown, FaArrowUp, FaQuestion } from "react-icons/fa6";
export function ComparisonCell({
  status,
  children,
  delay = 0,
  revealed = true,
  animate = false,
}: {
  status: string;
  children: ReactNode;
  delay?: number;
  revealed?: boolean;
  animate?: boolean;
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
      <div
        className={`comparison-card__inner${
          revealed
            ? animate
              ? " comparison-card__inner--animate"
              : " comparison-card__inner--revealed"
            : ""
        }`}
      >
        <div className="comparison-card__face comparison-card__face--cover">
          <FaQuestion aria-hidden focusable="false" />
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
