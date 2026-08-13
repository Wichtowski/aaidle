import { z } from "zod";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { assertSameOrigin, cookieValue, rateLimitSubject } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { consumeRateLimit, isAccountDisabled, userForSession } from "@/lib/auth/auth-service";
import { createGithubIssue, IssueReporterError } from "@/lib/github/issue-reporter";
import { readRequestText } from "@/lib/validation/request-body";

const reportSchema = z.object({
  title: z.string().trim().min(8).max(120),
  description: z.string().trim().min(20).max(5_000),
  page: z.string().regex(/^\/[^\r\n]{0,500}$/),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await userForSession(cookieValue(request, sessionCookieName));
    if (!user) {
      return authError("UNAUTHENTICATED", "Sign in to report an issue.", 401);
    }
    if (isAccountDisabled(user)) {
      return authError("ACCOUNT_DISABLED", "This account has been disabled.", 403);
    }

    const allowed = await consumeRateLimit({
      scope: "issue-report",
      subjectHash: rateLimitSubject(request, user.email),
      limit: 5,
      windowMs: 24 * 60 * 60 * 1_000,
    });
    if (!allowed) {
      return authError("RATE_LIMITED", "You can submit up to five reports per day.", 429);
    }

    const report = reportSchema.parse(JSON.parse(await readRequestText(request, 8_192)));
    const issueUrl = await createGithubIssue({
      title: report.title,
      body: `${report.description}\n\n---\nSubmitted through the aAIdle issue form\nPage: \`${report.page}\`\nAccount: \`${user.id}\``,
    });
    return Response.json({ issueUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof IssueReporterError) {
      if (error.code === "ISSUE_REPORTING_UNAVAILABLE") {
        return authError(error.code, "Issue reporting is not configured yet.", 503);
      }
      return authError(
        error.code,
        "GitHub could not create the issue. Please try again later.",
        502,
      );
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return authError("INVALID_ORIGIN", "Invalid request origin.", 403);
    }
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return authError("BODY_TOO_LARGE", "Your report is too large.", 413);
    }
    return authError("INVALID_REQUEST", "Please check the report details and try again.", 400);
  }
}
