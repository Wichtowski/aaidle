import { z } from "zod";
import { readRequestText } from "./request-body";
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
  afterIncorrectGuesses: z.number().int().positive(),
  kind: z.string(),
  text: z.string(),
});
export const logoProgressSchema = z.object({
  imageUrl: z.string(),
  focalPoint: z.object({
    x: z.number().min(0).max(512),
    y: z.number().min(0).max(512),
  }),
  imageRevision: z.number().int().nonnegative(),
  maximumImageRevision: z.number().int().nonnegative(),
  clues: z.array(logoClueSchema),
  solved: z.boolean(),
  attribution: z.string().optional(),
});
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
