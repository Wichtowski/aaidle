import { z } from "zod";
import { readRequestText } from "@/lib/validation/request-body";

const email = z.email().transform((value) => value.trim().toLocaleLowerCase("en-US"));

export const emailRequestSchema = z.object({ email });
export const passwordRegistrationSchema = z.object({
  email,
  password: z.string().min(12).max(128),
});
export const passwordLoginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export const passwordResetSchema = z.object({ email });
export const passwordResetCompletionSchema = z.object({
  password: z.string().min(12).max(128),
});

export async function parseAuthJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body = await readRequestText(request, 4_096);
  return schema.parse(JSON.parse(body));
}
