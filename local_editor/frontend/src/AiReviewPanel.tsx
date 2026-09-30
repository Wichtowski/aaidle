import type { JsonObject, JsonValue } from "./JsonFormEditor";

export type AiReview = {
  summary: string;
  suggestedItem: JsonObject;
  model: string;
  usage: { input_tokens?: number; output_tokens?: number };
};

type Change = { key: string; before?: JsonValue; after?: JsonValue };

function format(value: JsonValue | undefined): string {
  return value === undefined ? "(missing)" : JSON.stringify(value, null, 2);
}

function changes(current: JsonObject, suggested: JsonObject): Change[] {
  return [...new Set([...Object.keys(current), ...Object.keys(suggested)])]
    .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(suggested[key]))
    .map((key) => ({ key, before: current[key], after: suggested[key] }));
}

export function AiReviewPanel({
  current,
  review,
  analysing,
  disabled,
  onAnalyse,
  onApply,
}: {
  current: JsonObject | null;
  review: AiReview | null;
  analysing: boolean;
  disabled: boolean;
  onAnalyse: () => void;
  onApply: (suggested: JsonObject) => void;
}) {
  const diff = current && review ? changes(current, review.suggestedItem) : [];

  return (
    <section className="ai-review" aria-label="AI item review">
      <div className="ai-review-heading">
        <div>
          <span className="eyebrow">OPENAI REVIEW</span>
          <h3>Suggested changes</h3>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={onAnalyse}
          disabled={!current || disabled}
        >
          {analysing ? "Analysing…" : review ? "Analyse again" : "Analyse item"}
        </button>
      </div>
      {!review ? (
        <p className="empty-value">
          Analyse only this item. Your unsaved field values are sent through the local backend.
        </p>
      ) : (
        <>
          <p className="ai-summary">{review.summary}</p>
          <div className="ai-meta">Model: {review.model}</div>
          {diff.length ? (
            <div className="diff-list">
              {diff.map((change) => (
                <article className="diff-entry" key={change.key}>
                  <strong>{change.key}</strong>
                  <div className="diff-values">
                    <pre className="diff-before">− {format(change.before)}</pre>
                    <pre className="diff-after">+ {format(change.after)}</pre>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="no-changes">No changes suggested.</p>
          )}
          <button
            type="button"
            className="apply-suggestion"
            onClick={() => onApply(review.suggestedItem)}
            disabled={!diff.length || disabled}
          >
            Apply suggested item
          </button>
        </>
      )}
    </section>
  );
}
