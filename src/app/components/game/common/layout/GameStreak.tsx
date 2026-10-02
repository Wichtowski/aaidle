import { useContext, useEffect, useState } from "react";
import { apiClient } from "@lib/api/client";
import { streakForDay } from "@lib/domain/players/streak-display";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { getSnapshot, updateProgress } from "@lib/storage/local-progress-store";
import { utcDate } from "@lib/utils/dates";
import type { GameFamily } from "@lib/validation/streaks";
import { AuthContext } from "../../../auth/auth-context";

export function GameStreak({ family }: { family: GameFamily }) {
  const auth = useContext(AuthContext);
  const progress = useLocalProgress();
  const [refresh, setRefresh] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  // Until the server has answered in this view, the stored streaks are only a cache
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    const reloadWhenVisible = () => {
      if (!document.hidden) reload();
    };
    window.addEventListener("aaidle:game-progress", reload);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reloadWhenVisible);
    // Refresh over the canonical UTC boundary without using the client clock for eligibility.
    const interval = window.setInterval(reloadWhenVisible, 60_000);
    return () => {
      window.removeEventListener("aaidle:game-progress", reload);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reloadWhenVisible);
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
        setConfirmed(true);
        // Most refreshes return the same streaks; rewriting the store would re-render
        // every subscriber and wake other tabs for nothing
        if (JSON.stringify(getSnapshot().streaks) !== JSON.stringify(streaks)) {
          updateProgress((current) => ({ ...current, streaks }));
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setUnavailable(true);
        setConfirmed(false);
      });
    return () => controller.abort();
  }, [auth?.user?.id, auth?.loading, progress.playerId, refresh]);
  if (!progress.streaks) return null;
  const streak = confirmed
    ? progress.streaks[family]
    : streakForDay(progress.streaks, family, utcDate());
  const label = family[0]!.toUpperCase() + family.slice(1);
  return (
    <span className="game-streak" role="status">
      <span aria-hidden="true">🔥</span> {streak.currentStreak} day {label} streak
      <span className="game-streak__detail">
        {unavailable
          ? "Streak sync unavailable - showing saved progress."
          : streak.securedToday
            ? "Streak secured for today"
            : `Play any ${label} mode today to keep it going.`}
        {!unavailable && streak.securedToday && <span aria-hidden="true"> ✓</span>}
      </span>
    </span>
  );
}
