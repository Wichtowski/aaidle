import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { FaGithub } from "react-icons/fa6";
import { IssueReportForm } from "../components/issues/IssueReportForm";
import { SiteNavbar } from "../components/ui/SiteNavbar";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { userForSession } from "@/lib/auth/auth-service";
import { githubRepositoryUrl } from "@/lib/github/repository";

export const metadata: Metadata = {
  title: "Report an issue",
  robots: { index: false, follow: false },
};

export default async function ReportIssuePage() {
  const session = (await cookies()).get(sessionCookieName)?.value ?? null;
  const user = await userForSession(session);
  if (!user) redirect("/login");
  if (user.disabled_at) redirect("/account-disabled");

  return (
    <main className="page issue-report-page">
      <SiteNavbar />
      <section className="issue-report">
        <div className="issue-report__content">
          <p className="eyebrow">Authenticated reports</p>
          <h1>Report an issue.</h1>
          <p className="lede">Send a clear report and we will create the GitHub issue for you.</p>
          <IssueReportForm />
        </div>
        <aside className="issue-report__repository">
          <a
            aria-label="View the aAIdle source code on GitHub"
            className="github-repository-link"
            href={githubRepositoryUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <FaGithub aria-hidden="true" />
          </a>
        </aside>
      </section>
    </main>
  );
}
