import { afterEach, describe, expect, it, vi } from "vitest";
import { createGithubIssue } from "../../lib/github/issue-reporter";
import { githubRepository } from "../../lib/github/repository";

const originalFetch = globalThis.fetch;
const originalToken = process.env.AAIDLE_GITHUB_ISSUES_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.AAIDLE_GITHUB_ISSUES_TOKEN;
  else process.env.AAIDLE_GITHUB_ISSUES_TOKEN = originalToken;
});

describe("GitHub issue reporter", () => {
  it("creates an issue through the server-side GitHub API", async () => {
    process.env.AAIDLE_GITHUB_ISSUES_TOKEN = "test-token";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: "https://github.com/Wichtowski/aaidle/issues/42" }),
    });

    await expect(
      createGithubIssue({ title: "A reproducible bug", body: "Steps to reproduce" }),
    ).resolves.toBe("https://github.com/Wichtowski/aaidle/issues/42");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `https://api.github.com/repos/${githubRepository}/issues`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "A reproducible bug", body: "Steps to reproduce" }),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });
});
