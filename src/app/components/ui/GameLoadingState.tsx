type GameLoadingStateProps = {
  className?: string;
  label: string;
};

export function GameLoadingState({ className, label }: GameLoadingStateProps) {
  return (
    <section
      aria-live="polite"
      className={`game-loading-state${className ? ` ${className}` : ""}`}
      role="status"
    >
      <span aria-hidden="true" className="game-loading-state__spinner" />
      <span>{label}</span>
    </section>
  );
}
