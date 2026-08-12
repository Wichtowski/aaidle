import { z } from "zod";

const email = z.email().transform((value) => value.trim().toLocaleLowerCase("en-US"));

export const passwordRegistrationSchema = z.object({
  email,
  password: z.string().min(12).max(128),
});
export const passwordLoginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export async function parseAuthJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body = await request.text();
  if (body.length > 4_096) throw new Error("BODY_TOO_LARGE");
  return schema.parse(JSON.parse(body));
}
