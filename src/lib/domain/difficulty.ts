export const difficulties = ["normal", "challenge", "hardcore"] as const;
export type Difficulty = (typeof difficulties)[number];

export function isDifficulty(value: string | null | undefined): value is Difficulty {
  return difficulties.includes(value as Difficulty);
}
