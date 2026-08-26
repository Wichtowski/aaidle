import { useEffect, useRef, useState, type ReactNode } from "react";

export function FadeSwap({
  children,
  identity,
  className,
}: {
  children: ReactNode;
  identity: string;
  className?: string;
}) {
  const initialIdentity = useRef(identity).current;
  const [previous, setPrevious] = useState<{ content: ReactNode; identity: string } | null>(null);
  const current = useRef({ content: children, identity });
  const changed = current.current.identity !== identity;

  useEffect(() => {
    if (!changed) return;

    const old = current.current;
    current.current = { content: children, identity };
    setPrevious(old);
    const timer = window.setTimeout(() => setPrevious(null), 220);
    return () => window.clearTimeout(timer);
  }, [changed, children, identity]);

  if (!changed && identity === initialIdentity && previous === null) {
    return <>{children}</>;
  }

  return (
    <span className={`fade-swap${className ? ` ${className}` : ""}`}>
      {previous && (
        <span aria-hidden="true" className="fade-swap__old">
          {previous.content}
        </span>
      )}
      <span className={previous ? "fade-swap__new" : "fade-swap__new fade-swap__new--enter"}>
        {children}
      </span>
    </span>
  );
}
