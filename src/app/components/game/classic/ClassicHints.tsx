import { useEffect, useState } from "react";
import { apiClient } from "@lib/api/client";
import { classicColumnHeadings } from "@lib/domain/guesses/comparison-types";
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
  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    setError(null);
    void apiClient
      .classicAssists(challengeId, undefined, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setState(next);
        updateProgress((progress) => {
          const game = progress.games[gameKey];
          return game
            ? {
                ...progress,
                games: { ...progress.games, [gameKey]: { ...game, hints: next.hints } },
              }
            : progress;
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("We could not load your hints.");
      });
    return () => controller.abort();
  }, [challengeId, gameKey, attempts, userId, reload]);

  async function reveal(column: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await apiClient.classicAssists(challengeId, column);
      setState(next);
      updateProgress((progress) => {
        const game = progress.games[gameKey];
        return game
          ? { ...progress, games: { ...progress.games, [gameKey]: { ...game, hints: next.hints } } }
          : progress;
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We could not reveal this hint.");
    } finally {
      setBusy(false);
    }
  }

  if (!attempts && !state?.hints.length) return null;
  return (
    <section className="game-assists" aria-label="Classic hints" aria-busy={busy}>
      {state?.hints.map((hint) => (
        <p key={hint.column}>
          <strong>{classicColumnHeadings[hint.column]}:</strong>{" "}
          {hint.value === null
            ? "N/A"
            : Array.isArray(hint.value)
              ? hint.value.join(", ")
              : String(hint.value)}
        </p>
      ))}
      {Boolean(state?.remainingHints && state.availableColumns.length) && (
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
