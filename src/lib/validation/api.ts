import { z } from "zod";
import { readRequestText } from "./request-body";
import { classicColumns } from "../domain/guesses/comparison-types";

export const columnHintSchema = z.object({
  column: z.enum(classicColumns),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
});
export const classicAssistSchema = z.object({
  hints: z.array(columnHintSchema),
  availableColumns: z.array(z.enum(classicColumns)),
  remainingHints: z.number().int().nonnegative(),
});
export const autoPlacementSchema = z.object({
  cardId: z.string().min(1),
  position: z.number().int().nonnegative(),
});
export const timelineAssistSchema = z.object({
  autoPlacements: z.array(autoPlacementSchema),
  incorrectSubmissions: z.number().int().nonnegative(),
  unlockEvery: z.number().int().positive(),
  remainingAutoPlacements: z.number().int().nonnegative(),
  availableCardIds: z.array(z.string().min(1)),
});
export type ClassicAssistState = z.infer<typeof classicAssistSchema>;
export type TimelineAssistState = z.infer<typeof timelineAssistSchema>;
export const modeSchema = z.literal("classic");
export const guessRequestSchema = z.object({
  guessedModelId: z.string().min(1).max(120),
  attemptNumber: z.number().int().min(1).max(65_535),
});
export const emojiGuessRequestSchema = z.object({
  guessedFamilyId: z.string().min(1).max(120),
  attemptNumber: z.number().int().min(1).max(65_535),
});
export const logoModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  providerName: z.string(),
  familyName: z.string().nullable(),
  aliases: z.array(z.string()),
});
export const logoClueSchema = z.object({
  imageUrl: z.string().optional(),
  afterIncorrectGuesses: z.number().int().nonnegative(),
  kind: z.string(),
  text: z.string(),
});
const logoProgressBaseSchema = z.object({
  imageUrl: z.string(),
  imageRevision: z.number().int().nonnegative(),
  maximumImageRevision: z.number().int().nonnegative(),
  clues: z.array(logoClueSchema),
  solved: z.boolean(),
  attribution: z.string().optional(),
});
export const logoProgressSchema = z.discriminatedUnion("revealProfile", [
  logoProgressBaseSchema.extend({
    revealProfile: z.null(),
  }),
  logoProgressBaseSchema.extend({
    revealProfile: z.literal("progressive-zoom"),
    focalPoint: z.object({
      x: z.number().min(0).max(512),
      y: z.number().min(0).max(512),
    }),
  }),
  logoProgressBaseSchema.extend({
    revealProfile: z.literal("gaussian-blur"),
    blurStartStrength: z.number().positive().max(64),
    blurStepStrength: z.number().positive().max(64),
  }),
]);
export const logoGameSchema = z.object({
  challenge: z.object({
    id: z.uuid(),
    date: z.iso.date(),
    mode: z.literal("logo:normal"),
    difficulty: z.literal("normal"),
    expiresAt: z.string(),
  }),
  models: z.array(logoModelSchema).min(1),
  progress: logoProgressSchema,
  globalCompletionCount: z.number().int().nonnegative(),
});
export const logoHistorySchema = z.object({
  guesses: z.array(
    z.object({
      model: logoModelSchema,
      isCorrect: z.boolean(),
      attemptNumber: z.number().int().positive(),
    }),
  ),
  progress: logoProgressSchema,
});
export const logoGuessResponseSchema = z.object({
  guessedModel: logoModelSchema,
  isCorrect: z.boolean(),
  attemptNumber: z.number().int().positive(),
  progress: logoProgressSchema,
  globalCompletionCount: z.number().int().nonnegative(),
});
export const dateSchema = z.iso.date();
export const errorResponse = (code: string, message: string, status = 400) =>
  Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
export async function parseJson(request: Request) {
  const text = await readRequestText(request, 16_384);
  return guessRequestSchema.parse(JSON.parse(text));
}
export async function parseEmojiGuess(request: Request) {
  const text = await readRequestText(request, 16_384);
  return emojiGuessRequestSchema.parse(JSON.parse(text));
}
