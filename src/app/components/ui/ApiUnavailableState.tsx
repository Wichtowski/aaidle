import { FaTriangleExclamation } from "react-icons/fa6";

export function ApiUnavailableState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="api-unavailable" role="status" aria-live="polite">
      <FaTriangleExclamation aria-hidden="true" />
      <div>
        <p className="eyebrow">Game unavailable</p>
        <h2>We’re having trouble loading this game.</h2>
        <p>The game is temporarily unavailable. Please try again in a moment.</p>
        <button className="button button--primary" onClick={onRetry} type="button">
          Try again
        </button>
      </div>
    </section>
  );
}
