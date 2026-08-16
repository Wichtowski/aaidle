import { FaTriangleExclamation } from "react-icons/fa6";

export function ApiUnavailableState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="api-unavailable" role="status" aria-live="polite">
      <FaTriangleExclamation aria-hidden="true" />
      <div>
        <p className="eyebrow">Connection unstable</p>
        <h2>We’re having trouble connecting to aAIdle right now.</h2>
        <p>
          Your connection may be unstable or the game server may be temporarily unavailable.
          Try again in a moment.
        </p>
        <button className="button button--primary" onClick={onRetry} type="button">
          Try again
        </button>
      </div>
    </section>
  );
}
