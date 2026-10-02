import type { GameFamily, GameStreak, GameStreaks } from "../../validation/streaks";

const dayMs = 86_400_000;

// The cached streaks describe the game day they were fetched on. Shown on a later day,
// before the server answers or while it is unreachable, they must not claim that today
// is secured or that a streak which has since lapsed is still running
export function streakForDay(streaks: GameStreaks, family: GameFamily, today: string): GameStreak {
  const streak = streaks[family];
  if (streaks.currentGameDate === today) return streak;

  const daysSinceLast =
    streak.lastStreakDate === null
      ? Number.POSITIVE_INFINITY
      : Math.round((Date.parse(today) - Date.parse(streak.lastStreakDate)) / dayMs);
  return {
    ...streak,
    currentStreak: daysSinceLast >= 0 && daysSinceLast <= 1 ? streak.currentStreak : 0,
    securedToday: daysSinceLast === 0,
  };
}
