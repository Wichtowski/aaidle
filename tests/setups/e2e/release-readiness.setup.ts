import { appendFile } from "node:fs/promises";
import { env } from "../../env";
import { expect, test } from "../../fixtures/e2e";

const { expectedVersion } = env;
const timeoutMs = 20 * 60_000;

async function cancelWorkflow() {
  const { repository, runId, token } = env.github;
  if (!repository || !runId || !token) return false;

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/runs/${runId}/cancel`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  return response.ok;
}

test("waits for the requested release to reach production", async ({ basePage }) => {
  test.skip(!expectedVersion, "No deployed release version was requested.");
  test.setTimeout(timeoutMs + 30_000);

  try {
    await expect
      .poll(
        async () => {
          await basePage.goto("/");
          return basePage.documentRoot.getAttribute("version");
        },
        { timeout: timeoutMs, intervals: [30_000] },
      )
      .toBe(expectedVersion);
  } catch (error) {
    const message = `Production did not serve release ${expectedVersion} within 20 minutes.`;
    console.warn(`::warning::${message} Cancelling the workflow.`);

    if (env.github.stepSummaryPath) {
      await appendFile(
        env.github.stepSummaryPath,
        `## Production E2E cancelled\n\n${message}\nThe browser test shards were not run.\n`,
      );
    }

    if (await cancelWorkflow()) {
      await new Promise<never>(() => {});
    }

    throw error;
  }
});