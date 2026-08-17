import { useEffect, useMemo, useRef, useState } from "react";
import { FaCircleQuestion, FaLock } from "react-icons/fa6";
import {
  ApiError,
  apiClient,
  isApiUnavailable,
  type EmojiCluesDifficulty,
  type EmojiCluesGamePayload,
} from "@lib/api/client";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { SiteNavbar } from "../ui/SiteNavbar";
import { GameIntro } from "./GameLayout";
import { ApiUnavailableState } from "../ui/ApiUnavailableState";
import { GameLoadingState } from "../ui/GameLoadingState";
import { EmojiClueIcon } from "./emoji-clue-icons";
import { EmojiCluesHowToPlayDialog } from "./EmojiCluesHowToPlayDialog";

const difficultyLabels: Record<EmojiCluesDifficulty, string> = {
  normal: "Normal",
  challenge: "Challenge",
  hardcore: "Hardcore",
};

type Guess = { id: string; name: string; isCorrect: boolean };
type CachedGame = { game: EmojiCluesGamePayload; guesses: Guess[]; query: string };

export function EmojiCluesGame() {
  const progress = useLocalProgress();
  const [difficulty, setDifficulty] = useState<EmojiCluesDifficulty>("normal");
  const [game, setGame] = useState<EmojiCluesGamePayload | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hardcore, setHardcore] = useState<{
    signedIn: boolean;
    unlocked: boolean;
    completedCategories: string[];
    requiredCategories: string[];
  } | null>(null);
  const gameCache = useRef<Partial<Record<EmojiCluesDifficulty, CachedGame>>>({});

  useEffect(() => {
    void apiClient.hardcoreStatus().then(setHardcore).catch(setError);
  }, [loadAttempt]);
  useEffect(() => {
    if (difficulty === "hardcore" && !hardcore?.unlocked) {
      setGame(null);
      setIsLoadingGame(false);
      return;
    }
    const cachedGame = gameCache.current[difficulty];
    if (cachedGame) {
      setGame(cachedGame.game);
      setGuesses(cachedGame.guesses);
      setQuery(cachedGame.query);
      setError(null);
      setIsLoadingGame(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setGame(null);
    setGuesses([]);
    setError(null);
    setIsLoadingGame(true);
    void apiClient
      .emojiCluesGame(difficulty, controller.signal)
      .then((nextGame) => {
        if (active) {
          gameCache.current[difficulty] = { game: nextGame, guesses: [], query: "" };
          setGame(nextGame);
        }
      })
      .catch((nextError: unknown) => {
        if (active && !(nextError instanceof DOMException && nextError.name === "AbortError")) {
          setError(nextError);
        }
      })
      .finally(() => {
        if (active) setIsLoadingGame(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [difficulty, hardcore?.unlocked, loadAttempt]);

  const available = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en-US");
    if (!normalized || !game) return [];
    return game.entities
      .filter(
        (entity) =>
          !guesses.some((guess) => guess.id === entity.id) &&
          [entity.name, ...entity.aliases].some((value) =>
            value.toLocaleLowerCase("en-US").includes(normalized),
          ),
      )
      .slice(0, 8);
  }, [game, guesses, query]);
  const solved = guesses.some((guess) => guess.isCorrect);
  const choose = async (entity: EmojiCluesGamePayload["entities"][number]) => {
    if (!game || busy || solved) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiClient.submitEmojiCluesGuess(
        game.challenge.id,
        progress.playerId,
        crypto.randomUUID(),
        entity.id,
        guesses.length + 1,
      );
      setGuesses((current) => {
        const nextGuesses = [
          ...current,
          { id: entity.id, name: entity.name, isCorrect: response.isCorrect },
        ];
        const cachedGame = gameCache.current[difficulty];
        if (cachedGame) {
          gameCache.current[difficulty] = { ...cachedGame, guesses: nextGuesses, query: "" };
        }
        return nextGuesses;
      });
      setGame((current) => {
        if (!current) return current;
        const nextGame = {
          ...current,
          globalCompletionCount: response.globalCompletionCount,
          challenge: { ...current.challenge, clues: response.clues },
        };
        const cachedGame = gameCache.current[difficulty];
        if (cachedGame) {
          gameCache.current[difficulty] = { ...cachedGame, game: nextGame, query: "" };
        }
        return nextGame;
      });
      setQuery("");
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusy(false);
    }
  };

  const completed = hardcore?.completedCategories ?? [];
  const date = game?.challenge.date ?? null;
  return (
    <main className="page game-page emoji-clues-page">
      <SiteNavbar />
      <GameIntro
        completionCount={solved ? (game?.globalCompletionCount ?? null) : null}
        description="Visual associations unlock one clue at a time. Name the AI system, architecture, algorithm, or operator."
        expiresAt={game?.challenge.expiresAt ?? null}
        eyebrow={
          <>
            Emoji Clues · {date ?? "Loading"} · {difficultyLabels[difficulty]}
          </>
        }
        title="What AI idea do these clues point to?"
        titleId="emoji-clues-title"
      />
      <nav className="emoji-clues__modes" aria-label="Emoji Clues difficulty">
        {(Object.keys(difficultyLabels) as EmojiCluesDifficulty[])
          .filter((mode) => mode !== "hardcore" || hardcore?.unlocked)
          .map((mode) => (
            <button
              className={mode === difficulty ? "is-selected" : undefined}
              key={mode}
              type="button"
              onClick={() => setDifficulty(mode)}
            >
              {difficultyLabels[mode]}
            </button>
          ))}
      </nav>
      {difficulty === "hardcore" && !hardcore?.unlocked ? (
        <section className="emoji-clues__locked" aria-live="polite">
          <p className="eyebrow">
            <FaLock aria-hidden /> Hardcore locked
          </p>
          <h2>Complete Classic / Challenge in every category.</h2>
          <p>
            {completed.length} / {hardcore?.requiredCategories.length ?? 0} categories completed
            {!hardcore?.signedIn ? ". Sign in to track progress." : "."}
          </p>
          <ul>
            {(hardcore?.requiredCategories ?? []).map((category) => (
              <li key={category}>
                {completed.includes(category) ? "✓" : "○"}{" "}
                {category.replace("od", "object detection").replaceAll("-", " ")}
              </li>
            ))}
          </ul>
        </section>
      ) : isLoadingGame ? (
        <GameLoadingState label="Loading today’s Emoji Clues…" />
      ) : game ? (
        <section className="emoji-clues" aria-label="Visual clues and guesses">
          <ol className="emoji-clues__clues" aria-label="Visual clues">
            {Array.from({ length: game.challenge.maximumClues }, (_, index) => (
              <li
                className={
                  index < game.challenge.clues.length
                    ? "emoji-clues__clue"
                    : "emoji-clues__clue emoji-clues__clue--hidden"
                }
                key={index}
              >
                {index < game.challenge.clues.length ? (
                  game.challenge.clues[index].type === "emoji" ? (
                    game.challenge.clues[index].value
                  ) : (
                    <EmojiClueIcon icon={game.challenge.clues[index].icon} />
                  )
                ) : (
                  "?"
                )}
              </li>
            ))}
          </ol>
          {!solved && (
            <form
              className="emoji-clues__search"
              onSubmit={(event) => {
                event.preventDefault();
                if (available[0]) void choose(available[0]);
              }}
            >
              <label htmlFor="emoji-clues-search">Name the answer</label>
              <div>
                <input
                  id="emoji-clues-search"
                  value={query}
                  disabled={busy}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setQuery(nextQuery);
                    const cachedGame = gameCache.current[difficulty];
                    if (cachedGame) {
                      gameCache.current[difficulty] = { ...cachedGame, query: nextQuery };
                    }
                  }}
                  placeholder="GPT, BERT, K-Means…"
                />
                <button className="button" disabled={!available[0] || busy}>
                  Guess
                </button>
              </div>
              {available.length > 0 && (
                <ul>
                  {available.map((entity) => (
                    <li key={entity.id}>
                      <button type="button" onClick={() => void choose(entity)}>
                        <strong>{entity.name}</strong>
                        <small>{entity.entityKind.replaceAll("-", " ")}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          )}
          {guesses.length > 0 && (
            <ol className="emoji-clues__history">
              {guesses.map((guess, index) => (
                <li className={guess.isCorrect ? "is-correct" : ""} key={guess.id}>
                  <span>{index + 1}</span>
                  <strong>{guess.name}</strong>
                  <em>{guess.isCorrect ? "Correct" : "Not this one"}</em>
                </li>
              ))}
            </ol>
          )}
          {solved && <p className="emoji-clues__solved">Solved — of course.</p>}
        </section>
      ) : null}
      {Boolean(error) && isApiUnavailable(error) && (
        <ApiUnavailableState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
      )}
      {Boolean(error) && !isApiUnavailable(error) && (
        <p className="notice" role="alert">
          {error instanceof ApiError ? error.message : "Could not load Emoji Clues."}
        </p>
      )}
      <button
        aria-label="Emoji Clues rules"
        aria-haspopup="dialog"
        className="game-help__button game-help__button--floating"
        onClick={() => setShowHowToPlay(true)}
        title="Use associations, not letter rebuses."
        type="button"
      >
        <FaCircleQuestion aria-hidden />
        <span>How to play</span>
      </button>
      <EmojiCluesHowToPlayDialog open={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
    </main>
  );
}
