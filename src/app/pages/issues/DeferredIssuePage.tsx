import { AppPageLayout } from "@app/layouts/AppPageLayout";
import { IssueReportForm } from "@components/issues/IssueReportForm";

export default function DeferredIssuePage() {
  return (
    <AppPageLayout className="issue-report-page">
      <section className="issue-report">
        <div className="issue-report__content">
          <p className="eyebrow">Help improve aAIdle</p>
          <h1 data-testid="issue-report-heading">Report an issue.</h1>
          <p className="lede">Tell us what happened and how we can reproduce it.</p>
          <IssueReportForm />
        </div>
      </section>
    </AppPageLayout>
  );
}
