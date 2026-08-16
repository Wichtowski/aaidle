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
