import { z } from "zod";
export const modeSchema = z.literal("classic");
export const guessRequestSchema = z.object({
  guessedModelId: z.string().min(1).max(120),
  attemptNumber: z.number().int().min(1).max(100),
});
export const dateSchema = z.iso.date();
export const errorResponse = (code: string, message: string, status = 400) =>
  Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
export async function parseJson(request: Request) {
  const text = await request.text();
  if (text.length > 16_384) throw new Error("BODY_TOO_LARGE");
  return guessRequestSchema.parse(JSON.parse(text));
}
