import { useContext, useEffect, useState } from "react";
import { apiClient } from "@lib/api/client";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { updateProgress } from "@lib/storage/local-progress-store";
import type { GameFamily } from "@lib/validation/streaks";
import { AuthContext } from "../../../auth/auth-context";

export function GameStreak({ family }: { family: GameFamily }) {
  const auth = useContext(AuthContext);
  const progress = useLocalProgress();
  const [refresh, setRefresh] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener("aaidle:game-progress", reload);
    window.addEventListener("focus", reload);
    // Refresh over the canonical UTC boundary without using the client clock for eligibility.
    const interval = window.setInterval(reload, 60_000);
    return () => {
      window.removeEventListener("aaidle:game-progress", reload);
      window.removeEventListener("focus", reload);
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void apiClient
      .gameStreaks(controller.signal)
      .then((streaks) => {
        if (controller.signal.aborted) return;
        setUnavailable(false);
        updateProgress((current) => ({
          ...current,
          streaks,
          stats: {
            ...current.stats,
            classic: {
              ...current.stats.classic,
              currentStreak: streaks.classic.currentStreak,
              bestStreak: streaks.classic.longestStreak,
              lastSolvedDate: streaks.classic.lastStreakDate,
            },
          },
        }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setUnavailable(true);
      });
    return () => controller.abort();
  }, [auth?.user?.id, auth?.loading, progress.playerId, refresh]);
  const streak = progress.streaks?.[family];
  if (!streak) return null;
  const label = family[0]!.toUpperCase() + family.slice(1);
  return (
    <span className="game-streak" role="status">
      <span aria-hidden="true">🔥</span> {streak.currentStreak} day {label} streak
      <span className="game-streak__detail">
        {unavailable
          ? "Streak sync unavailable — showing saved progress."
          : streak.securedToday
            ? "Streak secured for today ✓"
            : `Play any ${label} mode today to keep it going.`}
      </span>
    </span>
  );
}
