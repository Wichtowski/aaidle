type GameLoadingStateProps = {
  label: string;
};

export function GameLoadingState({ label }: GameLoadingStateProps) {
  return (
    <section aria-live="polite" className="game-loading-state" role="status">
      <span aria-hidden="true" className="game-loading-state__spinner" />
      <span>{label}</span>
    </section>
  );
}
