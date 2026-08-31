import { useEffect, useState } from "react";
import { FaTrophy } from "react-icons/fa6";
import { apiClient } from "@lib/api/client";
import { useAuth } from "../../auth/useAuth";

function formatTime(timeMs: number) {
  return `${(timeMs / 1000).toFixed(1)}s`;
}

const podiumPlaces = {
  1: { emoji: "🥇", label: "1st place" },
  2: { emoji: "🥈", label: "2nd place" },
  3: { emoji: "🥉", label: "3rd place" },
} as const;

export function TimelineLeaderboard({
  challengeId,
  date,
  refreshKey,
}: {
  challengeId?: string;
  date?: string;
  refreshKey?: number;
}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<
    Array<{
      rank: number;
      displayName: string;
      isCurrentUser: boolean;
      submissions: number;
      timeMs: number;
    }>
  >([]);

  useEffect(() => {
    let active = true;
    const request = challengeId
      ? apiClient.timelineLeaderboard(challengeId)
      : date
        ? apiClient.datedTimelineLeaderboard(date)
        : apiClient.currentTimelineLeaderboard();
    void request
      .then((result) => {
        if (active) setEntries(result.entries);
      })
      .catch(() => {
        if (active) setEntries([]);
      });
    return () => {
      active = false;
    };
  }, [challengeId, date, refreshKey]);

  return (
    <section className="timeline-leaderboard" aria-labelledby="timeline-leaderboard-title">
      <div className="timeline-leaderboard__heading">
        <FaTrophy aria-hidden="true" />
        <div>
          <p className="eyebrow">Race the clock</p>
          <h2 id="timeline-leaderboard-title">Speedrun leaderboard</h2>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="timeline-leaderboard__empty">
          {date ? "No completed speedruns for this date." : "Be the first to set today’s time."}
        </p>
      ) : (
        <ol className="timeline-leaderboard__entries">
          {entries.map((entry) => {
            const podium = podiumPlaces[entry.rank as keyof typeof podiumPlaces];
            const isCurrentUser =
              entry.isCurrentUser ||
              Boolean(
                user?.username && entry.displayName.toLowerCase() === user.username.toLowerCase(),
              );
            return (
              <li key={`${entry.rank}-${entry.displayName}-${entry.timeMs}`}>
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
                {isCurrentUser ? (
                  <strong className="timeline-leaderboard__name timeline-leaderboard__name--current">
                    {entry.displayName}
                  </strong>
                ) : (
                  <span className="timeline-leaderboard__name">{entry.displayName}</span>
                )}
                <span className="timeline-leaderboard__submissions">
                  <strong>{entry.submissions}</strong>{" "}
                  {entry.submissions === 1 ? "submission" : "submissions"}
                </span>
                <time className="timeline-leaderboard__time">{formatTime(entry.timeMs)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
