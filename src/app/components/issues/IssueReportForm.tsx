import { useState, type SubmitEvent } from "react";
import { ApiError, apiClient } from "@lib/api/client";

export function IssueReportForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setIssueUrl(null);
    try {
      const issue = await apiClient.reportIssue(title, description);
      setIssueUrl(issue.url);
      setTitle("");
      setDescription("");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Could not send the report. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="issue-report__form" onSubmit={submit}>
      <label>
        Short title
        <input
          data-testid="issue-report-title"
          disabled={submitting}
          maxLength={120}
          minLength={8}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="The LLM challenge marks a correct guess wrong"
          required
          value={title}
        />
      </label>
      <label>
        What happened?
        <textarea
          data-testid="issue-report-description"
          disabled={submitting}
          maxLength={5_000}
          minLength={20}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Include what you expected, what happened instead, and how to reproduce it."
          required
          rows={8}
          value={description}
        />
      </label>
      <p className="issue-report__notice">Reports are sent to the public project issue tracker.</p>
      {error && (
        <p className="issue-report__error" role="alert">
          {error}
        </p>
      )}
      {issueUrl && (
        <p className="issue-report__success" role="status">
          Report sent.{" "}
          <a href={issueUrl} rel="noreferrer" target="_blank">
            View the issue on GitHub.
          </a>
        </p>
      )}
      <button
        className="button button--primary"
        data-testid="issue-report-submit"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Sending report…" : "Send report"}
      </button>
    </form>
  );
}
