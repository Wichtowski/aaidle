export type StreakState = {
  currentStreak: number;
  bestStreak: number;
  lastSolvedDate: string | null;
};
const yesterday = (date: string) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};
export function applySolvedStreak(previous: StreakState, today: string): StreakState {
  if (previous.lastSolvedDate === today) return previous;
  const currentStreak =
    previous.lastSolvedDate === yesterday(today) ? previous.currentStreak + 1 : 1;
  return {
    currentStreak,
    bestStreak: Math.max(previous.bestStreak, currentStreak),
    lastSolvedDate: today,
  };
}

export function calculateSolvedStreaks(challengeDates: string[]) {
  const dates = [...new Set(challengeDates)].sort().reverse();
  let currentStreak = 0;
  let runningStreak = 0;
  let bestStreak = 0;

  for (let index = 0; index < dates.length; index += 1) {
    const consecutive =
      index === 0 ||
      new Date(`${dates[index - 1]}T00:00:00Z`).getTime() -
        new Date(`${dates[index]}T00:00:00Z`).getTime() ===
        86_400_000;
    if (consecutive) {
      runningStreak += 1;
    } else {
      if (currentStreak === 0) currentStreak = runningStreak;
      runningStreak = 1;
    }
    bestStreak = Math.max(bestStreak, runningStreak);
  }

  if (currentStreak === 0) currentStreak = runningStreak;
  return { currentStreak, bestStreak };
}
