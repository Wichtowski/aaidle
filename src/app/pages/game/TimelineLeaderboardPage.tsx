import { Button } from "@components/ui/Button";
import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { PageEyebrow } from "@components/ui/PageEyebrow";
import { TimelineLeaderboard } from "@components/game/timeline/TimelineLeaderboard";
import { TimelineGlobalLeaderboard } from "@components/game/timeline/TimelineGlobalLeaderboard";
import { timelineLeaderboardPath } from "@lib/domain/games/timeline/timeline-types";
import { utcDate } from "@lib/utils/dates";
import { useParams } from "react-router-dom";

export function TimelineLeaderboardPage() {
  return (
    <AppPageLayout className="timeline-leaderboard-page">
      <PageEyebrow>Timeline Speedrun</PageEyebrow>
      <h1>Global leaderboard.</h1>
      <div className="timeline-leaderboard-page__description-row">
        <p className="lede">The fastest runs and most consistent players across every day.</p>
        <Button variant="outline" to={timelineLeaderboardPath(utcDate())}>
          Today’s leaderboard
        </Button>
      </div>
      <TimelineGlobalLeaderboard />
    </AppPageLayout>
  );
}

export function TimelineDailyLeaderboardPage() {
  const { date = "" } = useParams();
  const validDate = /^\d{8}$/.test(date);
  const formattedDate = validDate
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    : date;

  return (
    <AppPageLayout className="timeline-leaderboard-page">
      <PageEyebrow>Timeline Speedrun · {formattedDate}</PageEyebrow>
      <h1>Daily leaderboard.</h1>
      <div className="timeline-leaderboard-page__description-row">
        <p className="lede">See who placed this timeline fastest.</p>
        <Button variant="outline" to="/timeline/leaderboard">
          Global leaderboard
        </Button>
      </div>
      <TimelineLeaderboard date={date} />
    </AppPageLayout>
  );
}
