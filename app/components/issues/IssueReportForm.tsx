import { useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api/client";

export function IssueReportForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.reportIssue();
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
      <p className="issue-report__notice">
        Issue reporting is temporarily unavailable while its API v2 endpoint is being migrated.
      </p>
      {error && (
        <p className="issue-report__error" role="alert">
          {error}
        </p>
      )}
      <button className="button button--primary" disabled type="submit">
        Reporting unavailable
      </button>
    </form>
  );
}
