import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useAuth } from "../../../auth/useAuth";

export function RitualGateDialog() {
  const enterLinkRef = useRef<HTMLAnchorElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    enterLinkRef.current?.focus();
  }, []);

  return (
    <div
      aria-describedby="ritual-gate-description"
      aria-labelledby="ritual-gate-title"
      aria-modal="true"
      className="completed-modal ritual-gate"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        event.preventDefault();
        enterLinkRef.current?.focus();
      }}
      role="dialog"
    >
      <section className="completed ritual-gate__content">
        <p className="eyebrow">Six seals broken</p>
        <h2 id="ritual-gate-title">Something has noticed you.</h2>
        <p id="ritual-gate-description" className="completed__message">
          {user
            ? "Your profile is ready for the final step into Hardcore."
            : "Sign in or create an account to keep this victory and enter the Inner Circle."}
        </p>
        <div className="completed__actions">
          <Link
            className="button button--inner-circle"
            to={user ? "/profile" : "/login"}
            ref={enterLinkRef}
          >
            {user ? "Continue to profile" : "Sign in to continue"}
          </Link>
        </div>
      </section>
    </div>
  );
}
