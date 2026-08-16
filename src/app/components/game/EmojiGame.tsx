import { useEffect, useState } from "react";
import { FaCircleQuestion } from "react-icons/fa6";
import { ApiError, apiClient, isApiUnavailable, type EmojiGamePayload } from "@lib/api/client";
import { SiteNavbar } from "../ui/SiteNavbar";
import { EmojiCompletedDialog } from "./EmojiCompletedDialog";
import { EmojiHowToPlayDialog } from "./EmojiHowToPlayDialog";
import { FamilyAutocomplete } from "./FamilyAutocomplete";
import { GameIntro } from "./GameLayout";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { ApiUnavailableState } from "../ui/ApiUnavailableState";

type EmojiGuess = {
  requestId: string;
  familyId: string;
  familyName: string;
  providerName: string;
  isCorrect: boolean;
};

type RetryEmojiGuess = {
  family: EmojiGamePayload["families"][number];
  requestId: string;
  attemptNumber: number;
};

type StoredEmojiGame = {
  guesses: EmojiGuess[];
  solved: boolean;
};

function storageKey(challenge: EmojiGamePayload["challenge"]) {
  return `aaidle:emoji:v1:${challenge.id}`;
}

function readStoredGame(challenge: EmojiGamePayload["challenge"]): StoredEmojiGame {
  if (typeof window === "undefined") return { guesses: [], solved: false };
  try {
    const value = JSON.parse(
      window.localStorage.getItem(storageKey(challenge)) ?? "null",
    ) as StoredEmojiGame | null;
    if (!value || !Array.isArray(value.guesses)) return { guesses: [], solved: false };
    return {
      guesses: value.guesses,
      solved: Boolean(value.solved),
    };
  } catch {
    return { guesses: [], solved: false };
  }
}

export function EmojiGame({ initialGame }: { initialGame?: EmojiGamePayload }) {
  const progress = useLocalProgress();
  const [game, setGame] = useState<EmojiGamePayload | null>(initialGame ?? null);
  const [emoji, setEmoji] = useState(initialGame?.challenge.initialEmoji ?? []);
  const [guesses, setGuesses] = useState<EmojiGuess[]>([]);
  const [solved, setSolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [gameError, setGameError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [retryGuess, setRetryGuess] = useState<RetryEmojiGuess | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const guessedIds = new Set([
    ...guesses.map((guess) => guess.familyId),
    ...(retryGuess ? [retryGuess.family.id] : []),
  ]);
  const clueSlots = Array.from({ length: game?.challenge.maximumEmoji ?? 6 }, (_, index) => index);
  const lastGuess = guesses.at(-1);

  useEffect(() => {
    if (game) return;
    const controller = new AbortController();
    void apiClient
      .emojiGame(controller.signal)
      .then((next) => {
        setGame(next);
        setGameError(null);
      })
      .catch((loadError: unknown) => setGameError(loadError));
    return () => controller.abort();
  }, [game, loadAttempt]);

  useEffect(() => {
    if (!game) return;
    const saved = readStoredGame(game.challenge);
    setGuesses(saved.guesses);
    setSolved(saved.solved);
    setEmoji(game.challenge.initialEmoji);
    setLoaded(true);
  }, [game?.challenge]);

  useEffect(() => {
    if (!game) return;
    void apiClient
      .emojiHints(game.challenge.id, progress.playerId)
      .then(({ emoji: revealed }) => setEmoji(revealed))
      .catch((hintError: unknown) => setError(hintError));
  }, [game?.challenge.id, progress.playerId]);

  useEffect(() => {
    if (!loaded || !game) return;
    window.localStorage.setItem(
      storageKey(game.challenge),
      JSON.stringify({ guesses, solved } satisfies StoredEmojiGame),
    );
  }, [game?.challenge, guesses, loaded, solved]);

  const guess = async (
    family: EmojiGamePayload["families"][number],
    requestId: string = crypto.randomUUID(),
    attemptNumber = guesses.length + 1,
  ) => {
    const isRetry = retryGuess?.requestId === requestId;
    if (!game || busy || solved || (guessedIds.has(family.id) && !isRetry)) return;
    setBusy(true);
    setError(null);
    setRetryGuess(null);
    try {
      const response = await apiClient.submitEmojiGuess(
        game.challenge.id,
        progress.playerId,
        requestId,
        family.id,
        attemptNumber,
      );
      const entry: EmojiGuess = {
        requestId,
        familyId: family.id,
        familyName: family.name,
        providerName: family.providerName,
        isCorrect: response.guess.isCorrect,
      };
      if (response.globalCompletionCount !== null) {
        const globalCompletionCount = response.globalCompletionCount;
        setGame((current) => (current ? { ...current, globalCompletionCount } : current));
      }
      setGuesses((current) => [...current, entry]);
      setEmoji(response.emoji);
      if (entry.isCorrect) {
        setSolved(true);
        setShowCompletion(true);
      }
    } catch (submitError) {
      setRetryGuess({ family, requestId, attemptNumber });
      setError(submitError);
    } finally {
      setBusy(false);
    }
  };

  const refreshGame = () => {
    void apiClient
      .emojiGame()
      .then((next) => {
        setLoaded(false);
        setGame(next);
        setGameError(null);
      })
      .catch((loadError: unknown) => setGameError(loadError));
  };

  if (!game) {
    return (
      <main className="page game-page emoji-game-page">
        <SiteNavbar />
        <GameIntro
          completionCount={null}
          description="Start with two clues. Each wrong guess uncovers the next one."
          expiresAt={null}
          eyebrow={<>Emoji</>}
          title="Which AI family is this?"
          titleId="emoji-game-title"
        />
        {gameError !== null && isApiUnavailable(gameError) ? (
          <ApiUnavailableState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
        ) : gameError ? (
          <section className="notice" role="alert">
            <p>
              {gameError instanceof ApiError && gameError.status === 404
                ? "Today’s Emoji game is not available yet."
                : gameError instanceof Error
                  ? gameError.message
                  : "Could not load today’s Emoji game."}
            </p>
            <button className="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} type="button">
              Try again
            </button>
          </section>
        ) : <p className="notice">Loading today’s Emoji game…</p>}
      </main>
    );
  }

  return (
    <main className="page game-page emoji-game-page">
      <SiteNavbar />
      <GameIntro
        completionCount={solved ? game.globalCompletionCount : null}
        description="Start with two clues. Each wrong guess uncovers the next one."
        expiresAt={game.challenge.expiresAt}
        eyebrow={<>Emoji · {game.challenge.date}</>}
        input={
          !solved && (
            <FamilyAutocomplete
              disabled={busy}
              excluded={guessedIds}
              families={game.families}
              onPick={(family) => void guess(family)}
            />
          )
        }
        onExpiry={refreshGame}
        status={
          busy && (
            <p aria-live="polite" className="attempts">
              Checking…
            </p>
          )
        }
        title="Which AI family is this?"
        titleId="emoji-game-title"
      />
      {error !== null && isApiUnavailable(error) && retryGuess && (
        <ApiUnavailableState
          onRetry={() => void guess(retryGuess.family, retryGuess.requestId, retryGuess.attemptNumber)}
        />
      )}
      {error !== null && isApiUnavailable(error) && !retryGuess && (
        <ApiUnavailableState onRetry={() => void refreshGame()} />
      )}
      {error !== null && !isApiUnavailable(error) && (
        <div className="notice" role="alert">
          <p>{error instanceof Error ? error.message : "Your guess could not be submitted."}</p>
          {retryGuess && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void guess(retryGuess.family, retryGuess.requestId, retryGuess.attemptNumber)}
              type="button"
            >
              Retry guess
            </button>
          )}
        </div>
      )}

      <section className="emoji-game" aria-label="Emoji clues and guesses">
        <ol className="emoji-game__clues" aria-label="Emoji clues">
          {clueSlots.map((slot) => {
            const revealed = slot < emoji.length;
            return (
              <li
                className={
                  revealed ? "emoji-game__clue" : "emoji-game__clue emoji-game__clue--hidden"
                }
                key={slot}
              >
                {revealed ? (emoji[slot] ?? "…") : "?"}
              </li>
            );
          })}
        </ol>

        {guesses.length > 0 && (
          <section className="emoji-game__history" aria-labelledby="emoji-history-title">
            <h2 id="emoji-history-title">Your guesses</h2>
            <ol>
              {guesses.map((entry, index) => (
                <li
                  className={
                    entry.isCorrect
                      ? "emoji-game__guess emoji-game__guess--correct"
                      : "emoji-game__guess"
                  }
                  key={`${entry.familyId}:${index}`}
                >
                  <span>{index + 1}</span>
                  <strong>{entry.familyName}</strong>
                  <em>{entry.isCorrect ? "Correct" : "Not this family"}</em>
                </li>
              ))}
            </ol>
          </section>
        )}
      </section>
      <button
        aria-label="Emoji game rules"
        className="game-help__button game-help__button--floating"
        onClick={() => setShowRules(true)}
        type="button"
      >
        <FaCircleQuestion aria-hidden focusable="false" />
      </button>
      <EmojiHowToPlayDialog open={showRules} onClose={() => setShowRules(false)} />
      {showCompletion && solved && lastGuess?.isCorrect && (
        <EmojiCompletedDialog
          familyName={lastGuess.familyName}
          guesses={guesses}
          onClose={() => setShowCompletion(false)}
        />
      )}
    </main>
  );
}
