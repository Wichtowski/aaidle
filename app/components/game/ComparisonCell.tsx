import type { CSSProperties, ReactNode } from "react";
import { FaArrowDown, FaArrowUp, FaQuestion } from "react-icons/fa6";
export function ComparisonCell({
  status,
  children,
  delay = 0,
  revealed = true,
  animate = false,
  hardcore = false,
  tooltip,
}: {
  status: string;
  children: ReactNode;
  delay?: number;
  revealed?: boolean;
  animate?: boolean;
  hardcore?: boolean;
  tooltip?: string;
}) {
  const displayStatus = hardcore && status !== "correct" ? "incorrect" : status;
  const label =
    displayStatus === "correct"
      ? "Correct"
      : displayStatus === "partial"
        ? "Partially matches"
        : displayStatus === "higher"
          ? "Target is higher"
          : displayStatus === "lower"
            ? "Target is lower"
            : displayStatus === "unknown"
              ? "Not applicable"
              : "Does not match";
  const DirectionIcon =
    displayStatus === "higher" ? FaArrowUp : displayStatus === "lower" ? FaArrowDown : null;
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
          className={`comparison comparison--${displayStatus} comparison-card__face comparison-card__face--result`}
        >
          {DirectionIcon ? (
            <div className="comparison-card__directional-value">
              <div className="comparison-card__value">{children ?? "N/A"}</div>
              <DirectionIcon
                aria-hidden
                className="comparison-card__direction"
                focusable="false"
              />
            </div>
          ) : (
            <div
              aria-label={tooltip}
              className="comparison-card__value"
              data-tooltip={tooltip}
              tabIndex={tooltip ? 0 : undefined}
            >
              {children ?? "N/A"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
