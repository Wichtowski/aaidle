import { useEffect, useState } from "react";
import { FaChartLine, FaTrophy } from "react-icons/fa6";
import { apiClient } from "@lib/api/client";
import type {
  TimelineGlobalLeaderboardEntry,
  TimelineGlobalLeaderboardPayload,
} from "@lib/domain/games/timeline/timeline-types";
import { useAuth } from "../../auth/useAuth";

type Ranking = keyof TimelineGlobalLeaderboardPayload;

const rankingOptions: Array<{ id: Ranking; label: string }> = [
  { id: "fastest", label: "Fastest run" },
  { id: "average", label: "Average time" },
  { id: "completions", label: "Completed" },
];

const podiumPlaces = {
  1: { emoji: "🥇", label: "1st place" },
  2: { emoji: "🥈", label: "2nd place" },
  3: { emoji: "🥉", label: "3rd place" },
} as const;

const formatTime = (timeMs: number) => `${(timeMs / 1000).toFixed(1)}s`;

function primaryValue(entry: TimelineGlobalLeaderboardEntry, ranking: Ranking) {
  if (ranking === "completions") {
    return `${entry.completedSpeedruns} ${entry.completedSpeedruns === 1 ? "run" : "runs"}`;
  }
  return formatTime(ranking === "fastest" ? entry.fastestTimeMs : entry.averageTimeMs);
}

function SpeedrunTrend({ entry }: { entry: TimelineGlobalLeaderboardEntry }) {
  const values = entry.recentRuns.map((run) => run.timeMs);
  if (values.length < 2) return <span className="timeline-global-leaderboard__no-trend">New</span>;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 116 + 2;
      const y = ((value - minimum) / range) * 26 + 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-label={`${entry.displayName}'s time trend over ${values.length} completed speedruns`}
      className="timeline-global-leaderboard__trend"
      role="img"
      viewBox="0 0 120 32"
    >
      <polyline fill="none" points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TimelineGlobalLeaderboard() {
  const { user } = useAuth();
  const [ranking, setRanking] = useState<Ranking>("fastest");
  const [leaderboard, setLeaderboard] = useState<TimelineGlobalLeaderboardPayload | null>(null);

  useEffect(() => {
    let active = true;
    void apiClient
      .globalTimelineLeaderboard()
      .then((result) => {
        if (active) setLeaderboard(result);
      })
      .catch(() => {
        if (active) setLeaderboard({ fastest: [], average: [], completions: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  const entries = leaderboard?.[ranking] ?? [];

  return (
    <section
      className="timeline-leaderboard timeline-global-leaderboard"
      aria-labelledby="global-leaderboard-title"
    >
      <div className="timeline-leaderboard__heading">
        <FaTrophy aria-hidden="true" />
        <div>
          <p className="eyebrow">All-time records</p>
          <h2 id="global-leaderboard-title">Speedrun rankings</h2>
        </div>
      </div>
      <div aria-label="Global ranking" className="timeline-global-leaderboard__tabs" role="tablist">
        {rankingOptions.map((option) => (
          <button
            aria-selected={ranking === option.id}
            className="button"
            key={option.id}
            onClick={() => setRanking(option.id)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {leaderboard && entries.length === 0 ? (
        <p className="timeline-leaderboard__empty">No completed speedruns yet.</p>
      ) : (
        <ol className="timeline-global-leaderboard__entries">
          {entries.map((entry) => {
            const podium = podiumPlaces[entry.rank as keyof typeof podiumPlaces];
            const isCurrentUser =
              entry.isCurrentUser ||
              Boolean(
                user?.username && entry.displayName.toLowerCase() === user.username.toLowerCase(),
              );
            return (
              <li key={`${ranking}-${entry.rank}-${entry.displayName}`}>
                <span className="timeline-leaderboard__rank">
                  {podium ? (
                    <>
                      <span aria-hidden="true" className="timeline-leaderboard__medal">
                        {podium.emoji}
                      </span>
                      <span className="sr-only">{podium.label}</span>
                    </>
                  ) : (
                    entry.rank
                  )}
                </span>
                <div className="timeline-global-leaderboard__runner">
                  {isCurrentUser ? (
                    <strong className="timeline-leaderboard__name timeline-leaderboard__name--current">
                      {entry.displayName}
                    </strong>
                  ) : (
                    <span className="timeline-leaderboard__name">{entry.displayName}</span>
                  )}
                  <span className="timeline-global-leaderboard__meta">
                    {entry.completedSpeedruns} completed · {formatTime(entry.averageTimeMs)} average
                    · {entry.averageSubmissions.toFixed(1)} average submissions
                  </span>
                </div>
                <div className="timeline-global-leaderboard__chart">
                  <FaChartLine aria-hidden="true" />
                  <SpeedrunTrend entry={entry} />
                </div>
                <strong className="timeline-global-leaderboard__value">
                  {primaryValue(entry, ranking)}
                </strong>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
