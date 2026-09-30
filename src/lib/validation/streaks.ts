import { z } from "zod";

export const gameFamilies = ["classic", "timeline", "emoji", "logo"] as const;
export type GameFamily = (typeof gameFamilies)[number];
const date = z.iso.date();
export const gameStreakSchema = z.object({
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  lastStreakDate: date.nullable(),
  securedToday: z.boolean(),
  qualifyingDates: z.array(date),
});
export const gameStreaksSchema = z.object({
  currentGameDate: date,
  classic: gameStreakSchema,
  timeline: gameStreakSchema,
  emoji: gameStreakSchema,
  logo: gameStreakSchema,
});
export type GameStreaks = z.infer<typeof gameStreaksSchema>;
