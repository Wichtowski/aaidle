import Link from "next/link";

export function RitualGateDialog() {
  return (
    <div
      aria-describedby="ritual-gate-description"
      aria-labelledby="ritual-gate-title"
      aria-modal="true"
      className="completed-modal ritual-gate"
      role="dialog"
    >
      <section className="completed ritual-gate__content">
        <p className="eyebrow">Six seals broken</p>
        <h2 id="ritual-gate-title">Something has noticed you.</h2>
        <p id="ritual-gate-description" className="completed__message">
          The ledger will not let you return to the catalogue yet.
        </p>
        <div className="completed__actions">
          <Link className="button button--inner-circle" href="/profile">
            Enter your soul
          </Link>
        </div>
      </section>
    </div>
  );
}
