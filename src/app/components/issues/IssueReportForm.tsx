import { useState, type SubmitEvent } from "react";
import { ApiError, apiClient } from "@lib/api/client";

type IssueGame = "classic" | "emoji" | "timeline" | "logo";

export function IssueReportForm() {
  const [game, setGame] = useState<IssueGame | "">("");
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
      const issue = await apiClient.reportIssue(title, description, game as IssueGame);
      setIssueUrl(issue.url);
      setGame("");
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
        Game
        <select
          data-testid="issue-report-game"
          disabled={submitting}
          onChange={(event) => setGame(event.target.value as IssueGame | "")}
          required
          value={game}
        >
          <option disabled value="">
            Choose the game this issue affects
          </option>
          <option value="classic">Classic</option>
          <option value="emoji">Emoji</option>
          <option value="timeline">Timeline</option>
          <option value="logo">Logo</option>
        </select>
      </label>
      <label>
        Short title
        <input
          data-testid="issue-report-title"
          disabled={submitting}
          maxLength={120}
          minLength={8}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Summarize the problem in a few words"
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
          placeholder="Tell us what you expected, what happened, and how to reproduce it."
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
