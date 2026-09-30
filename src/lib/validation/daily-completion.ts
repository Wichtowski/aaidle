import { z } from "zod";

export const dailyTierSchema = z.enum(["normal", "challenge", "hardcore"]);
const resultSchema = z.object({
  id: z.string(),
  label: z.string(),
  completed: z.boolean(),
  result: z.string(),
  modifiers: z.array(z.string()),
});
export const dailyCompletionSchema = z.object({
  challengeDate: z.iso.date(),
  sequenceNumber: z.number().int().positive().nullable(),
  requirementVersion: z.number().int().positive(),
  groups: z.array(resultSchema.extend({ results: z.array(resultSchema) })),
  highestCompletedTier: dailyTierSchema.nullable(),
  allRequiredGamesComplete: z.boolean(),
  hardcoreSweep: z.boolean(),
  highestCelebratedTier: dailyTierSchema.nullable(),
  goatSeen: z.boolean(),
});
export const dailyMilestoneSchema = z.object({
  highestCelebratedTier: dailyTierSchema.nullable(),
  goatSeen: z.boolean(),
});
export type DailyCompletionSummary = z.infer<typeof dailyCompletionSchema>;
export type DailyTier = z.infer<typeof dailyTierSchema>;
export type DailyMilestone = z.infer<typeof dailyMilestoneSchema>;
