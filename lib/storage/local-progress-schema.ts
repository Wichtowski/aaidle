import { z } from "zod";
import { classicColumns } from "../domain/guesses/comparison-types";
const comparison = z.object(
  Object.fromEntries(
    classicColumns.map((column) => [
      column,
      column === "country" ? z.string().default("unknown") : z.string(),
    ]),
  ),
) as z.ZodType<Record<string, string>>;
export const localProgressSchema = z.object({
  version: z.literal(1),
  playerId: z.uuid(),
  activeMode: z.literal("classic"),
  games: z.record(
    z.string(),
    z.object({
      challengeId: z.string(),
      challengeDate: z.string(),
      mode: z.enum(["classic", "classic:normal", "classic:challenge", "classic:hardcore"]),
      status: z.enum(["in-progress", "solved"]),
      guesses: z.array(
        z.object({
          requestId: z.uuid(),
          modelId: z.string(),
          modelName: z.string(),
          attemptedAt: z.string(),
          attemptNumber: z.number(),
          isCorrect: z.boolean(),
          sameGuessCount: z.number(),
          matchingCategories: z.array(z.string()).default([]),
          matchingInputModalities: z.array(z.string()).default([]),
          matchingOutputModalities: z.array(z.string()).default([]),
          matchingUseCases: z.array(z.string()).default([]),
          model: z.unknown(),
          comparison,
        }),
      ),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
  stats: z.object({
    classic: z.object({
      currentStreak: z.number(),
      bestStreak: z.number(),
      gamesPlayed: z.number(),
      gamesWon: z.number(),
      lastPlayedDate: z.string().nullable(),
      lastSolvedDate: z.string().nullable(),
      guessDistribution: z.record(z.string(), z.number()),
    }),
  }),
  preferences: z.object({
    reducedMotion: z.boolean(),
    highContrast: z.boolean(),
    hasSeenClassicPrivacy: z.boolean().default(false),
  }),
});
export type LocalProgress = z.infer<typeof localProgressSchema>;
