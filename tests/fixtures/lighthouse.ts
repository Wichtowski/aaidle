import { chromium, type Browser, type Page } from "playwright";
import { test as base } from "@playwright/test";
import getPort from "get-port";
import { env } from "../env";
import { applyCloudflareE2EHeaders, cloudflareE2EHeaders } from "../http-headers";

type LighthouseFixtures = {
  lighthousePage: Page;
};

type LighthouseWorkerFixtures = {
  lighthouseBrowser: Browser;
  port: number;
};

export const lighthouseTest = base.extend<LighthouseFixtures, LighthouseWorkerFixtures>({
  port: [
    async ({ browser: _browser }, use) => {
      void _browser;
      await use(await getPort());
    },
    { scope: "worker" },
  ],

  lighthouseBrowser: [
    async ({ port }, use) => {
      const browser = await chromium.launch({
        args: [`--remote-debugging-port=${port}`],
      });

      await use(browser);
      await browser.close();
    },
    { scope: "worker" },
  ],

  lighthousePage: async ({ lighthouseBrowser }, use) => {
    const context = await lighthouseBrowser.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: cloudflareE2EHeaders(),
      serviceWorkers: "block",
    });
    await applyCloudflareE2EHeaders(context);
    const page = await context.newPage();

    await use(page);
    await context.close();
  },
});
