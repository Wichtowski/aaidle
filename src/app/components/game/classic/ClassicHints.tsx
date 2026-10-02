import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@lib/api/client";
import { classicColumnHeadings } from "@lib/domain/guesses/comparison-types";
import { formatHintValue } from "@lib/domain/guesses/value-format";
import { updateProgress } from "@lib/storage/local-progress-store";
import type { ClassicAssistState } from "@lib/validation/api";
import { Button } from "../../ui/Button";

export function ClassicHints({
  challengeId,
  gameKey,
  attempts,
  userId,
}: {
  challengeId: string;
  gameKey: string;
  attempts: number;
  userId?: string;
}) {
  const [state, setState] = useState<ClassicAssistState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Only the most recently started request may update the view, so a slow refresh
  // cannot overwrite a hint that was revealed after it started
  const latestRequest = useRef(0);

  const apply = useCallback(
    (next: ClassicAssistState) => {
      setState(next);
      updateProgress((progress) => {
        const game = progress.games[gameKey];
        return game
          ? { ...progress, games: { ...progress.games, [gameKey]: { ...game, hints: next.hints } } }
          : progress;
      });
    },
    [gameKey],
  );

  // Hints belong to one player's challenge. They stay visible while they are refreshed
  // after a guess
  useEffect(() => {
    setState(null);
    setError(null);
  }, [challengeId, userId]);

  useEffect(() => {
    const controller = new AbortController();
    const request = ++latestRequest.current;
    setError(null);
    void apiClient
      .classicAssists(challengeId, undefined, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted && request === latestRequest.current) apply(next);
      })
      .catch(() => {
        if (!controller.signal.aborted && request === latestRequest.current) {
          setError("We could not load your hints.");
        }
      });
    return () => controller.abort();
  }, [challengeId, attempts, userId, reload, apply]);

  async function reveal(column: string) {
    const request = ++latestRequest.current;
    setBusy(true);
    setError(null);
    try {
      const next = await apiClient.classicAssists(challengeId, column);
      if (request === latestRequest.current) apply(next);
      else setReload((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We could not reveal this hint.");
    } finally {
      setBusy(false);
    }
  }

  const canReveal = Boolean(state?.remainingHints && state.availableColumns.length);
  if (!state?.hints.length && !canReveal && !error) return null;
  return (
    <section className="game-assists" aria-label="Classic hints" aria-busy={busy}>
      <div aria-live="polite">
        {state?.hints.map((hint) => (
          <p key={hint.column}>
            <strong>{classicColumnHeadings[hint.column]}:</strong>{" "}
            {formatHintValue(hint.column, hint.value)}
          </p>
        ))}
      </div>
      {canReveal && (
        <>
          <p>Need a hint? Choose a property to reveal.</p>
          <div className="game-assists__choices">
            {state!.availableColumns.map((column) => (
              <Button key={column} disabled={busy} onClick={() => void reveal(column)}>
                {classicColumnHeadings[column]}
              </Button>
            ))}
          </div>
        </>
      )}
      {error && (
        <p role="alert">
          {error} <Button onClick={() => setReload((value) => value + 1)}>Retry hints</Button>
        </p>
      )}
    </section>
  );
}
