import { githubRepository } from "./repository";

type IssueInput = {
  title: string;
  body: string;
};

type GitHubIssueResponse = {
  html_url?: unknown;
};

export class IssueReporterError extends Error {
  constructor(public readonly code: "ISSUE_REPORTING_UNAVAILABLE" | "ISSUE_CREATION_FAILED") {
    super(code);
  }
}

export async function createGithubIssue({ title, body }: IssueInput): Promise<string> {
  const token = process.env.AAIDLE_GITHUB_ISSUES_TOKEN;
  if (!token) throw new IssueReporterError("ISSUE_REPORTING_UNAVAILABLE");

  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${githubRepository}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "aaidle-issue-reporter",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ title, body }),
    });
  } catch {
    throw new IssueReporterError("ISSUE_CREATION_FAILED");
  }

  const issue = (await response.json().catch(() => null)) as GitHubIssueResponse | null;
  if (!response.ok || !issue || typeof issue.html_url !== "string") {
    throw new IssueReporterError("ISSUE_CREATION_FAILED");
  }
  return issue.html_url;
}
