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
