import { useContext } from "react";
import { DailyCompletionContext } from "./daily-completion-context";
export function DailySummaryButton({ date }: { date?: string }) {
  const context = useContext(DailyCompletionContext);
  if (!context?.summary?.allRequiredGamesComplete) return null;
  if (date && context.summary.challengeDate !== date) return null;
  return (
    <button
      className="daily-summary-button"
      type="button"
      onClick={() => context.reopen(date?.replaceAll("-", ""))}
    >
      Daily summary
    </button>
  );
}
