import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { firstGameDate, parseGameRouteDate } from "@lib/domain/challenges/historical-dates";
import { utcDate } from "@lib/utils/dates";
import { SiteNavbar } from "../../ui/SiteNavbar";

export function HistoricalGameGuard({ children }: { children: ReactNode }) {
  const { date } = useParams();
  const progress = useLocalProgress();
  const selected = date ? parseGameRouteDate(date) : null;
  // The cached game day can be older than today, so it never lowers the upper bound.
  // The server still decides; this only avoids a request for an obviously invalid date
  const cachedDay = progress.streaks?.currentGameDate ?? "";
  const latestDay = cachedDay > utcDate() ? cachedDay : utcDate();
  if (date && (!selected || selected < firstGameDate || selected > latestDay)) {
    return (
      <main className="page">
        <SiteNavbar />
        <h1>Daily game unavailable</h1>
        <p>Choose a valid daily date from August 11, 2026 through the current game day.</p>
      </main>
    );
  }
  return children;
}
