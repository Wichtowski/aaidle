import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { TimelineLeaderboard } from "@components/game/timeline/TimelineLeaderboard";
import { TimelineGlobalLeaderboard } from "@components/game/timeline/TimelineGlobalLeaderboard";
import { timelineLeaderboardPath } from "@lib/domain/games/timeline/timeline-types";
import { utcDate } from "@lib/utils/dates";
import { Link, useParams } from "react-router-dom";

export function TimelineLeaderboardPage() {
  return (
    <AppPageLayout className="timeline-leaderboard-page">
      <p className="eyebrow">Timeline Speedrun</p>
      <h1>Global leaderboard.</h1>
      <div className="timeline-leaderboard-page__description-row">
        <p className="lede">The fastest runs and most consistent players across every day.</p>
        <Link className="button" to={timelineLeaderboardPath(utcDate())}>
          Today’s leaderboard
        </Link>
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
      <p className="eyebrow">Timeline Speedrun · {formattedDate}</p>
      <h1>Daily leaderboard.</h1>
      <div className="timeline-leaderboard-page__description-row">
        <p className="lede">See who placed this timeline fastest.</p>
        <Link className="button" to="/timeline/leaderboard">
          Global leaderboard
        </Link>
      </div>
      <TimelineLeaderboard date={date} />
    </AppPageLayout>
  );
}
