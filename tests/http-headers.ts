import type { BrowserContext } from "@playwright/test";
import { env } from "./env";

export const cloudflareE2EHeaders = (): Record<string, string> | undefined =>
  env.cloudflareE2EToken ? { "x-aaidle-cf-e2e-token": env.cloudflareE2EToken } : undefined;

export async function applyCloudflareE2EHeaders(context: BrowserContext) {
  const headers = cloudflareE2EHeaders();
  if (!headers) return;

  await context.setExtraHTTPHeaders(headers);
  await context.route(`${env.baseURL}/**`, async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        ...headers,
      },
    });
  });
}
