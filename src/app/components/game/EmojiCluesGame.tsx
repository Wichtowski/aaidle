import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FaCircleQuestion, FaLock } from "react-icons/fa6";
import {
  apiClient,
  isApiUnavailable,
  type EmojiCluesDifficulty,
  type EmojiCluesGamePayload,
  type VisualClue,
} from "@lib/api/client";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { utcDate } from "@lib/utils/dates";
import { SiteNavbar } from "../ui/SiteNavbar";
import { GameEyebrow } from "./GameEyebrow";
import { GameIntro } from "./GameLayout";
import { ApiUnavailableState } from "../ui/ApiUnavailableState";
import { GameLoadingState } from "../ui/GameLoadingState";
import { Toast } from "../ui/Toast";
import { EmojiClueIcon } from "./emoji-clue-icons";
import { EmojiHTP } from "./EmojiHTP";
import { DifficultySwitch } from "./DifficultySwitch";

const EmojiCluesCompletedDialog = lazy(() =>
  import("./EmojiCluesCompletedDialog").then(({ EmojiCluesCompletedDialog }) => ({
    default: EmojiCluesCompletedDialog,
  })),
);

const emojiCluePools: ReadonlyArray<{
  difficulty: EmojiCluesDifficulty;
  pool: 0 | 1 | 2;
  label: string;
}> = [
  { difficulty: "normal", pool: 0, label: "Normal" },
  { difficulty: "challenge", pool: 1, label: "Challenge" },
  { difficulty: "hardcore", pool: 2, label: "Hardcore" },
];

type Guess = { id: string; name: string; isCorrect: boolean };
type CachedGame = { game: EmojiCluesGamePayload; guesses: Guess[]; query: string };

function clueKey(clue: VisualClue | undefined) {
  if (!clue) return "hidden";
  if (clue.type === "emoji") return `emoji-${clue.value}`;
  if (clue.type === "icon") return `icon-${clue.icon}`;
  return `image-${clue.src}`;
}

export function EmojiCluesGame() {
  const progress = useLocalProgress();
  const [difficulty, setDifficulty] = useState<EmojiCluesDifficulty>("normal");
  const [game, setGame] = useState<EmojiCluesGamePayload | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [query, setQuery] = useState("");
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hardcore, setHardcore] = useState<{
    signedIn: boolean;
    unlocked: boolean;
    completedCategories: string[];
    requiredCategories: string[];
  } | null>(null);
  const gameCache = useRef<Partial<Record<EmojiCluesDifficulty, CachedGame>>>({});
  const hydratedHistoryKeys = useRef(new Set<string>());
  const loadFailureKey = useRef<EmojiCluesDifficulty | null>(null);
  const loadFailureCount = useRef(0);
  const guessFailureEntityId = useRef<string | null>(null);
  const guessFailureCount = useRef(0);
  const completionTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    },
    [],
  );

  useEffect(() => {
    void apiClient.hardcoreStatus().then(setHardcore).catch(setError);
  }, [loadAttempt]);
  useEffect(() => {
    if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    completionTimer.current = null;
    setShowCompletion(false);

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
    if (loadFailureKey.current !== difficulty) {
      loadFailureKey.current = difficulty;
      loadFailureCount.current = 0;
    }
    const controller = new AbortController();
    let active = true;
    let retrying = false;
    setGame(null);
    setGuesses([]);
    setError(null);
    setIsLoadingGame(true);
    void apiClient
      .emojiCluesGame(difficulty, controller.signal)
      .then((nextGame) => {
        if (active) {
          loadFailureCount.current = 0;
          gameCache.current[difficulty] = { game: nextGame, guesses: [], query: "" };
          setGame(nextGame);
        }
      })
      .catch((nextError: unknown) => {
        if (active && !(nextError instanceof DOMException && nextError.name === "AbortError")) {
          if (isApiUnavailable(nextError) && loadFailureCount.current === 0) {
            loadFailureCount.current += 1;
            retrying = true;
            setToast("The game is temporarily unavailable. Retrying now.");
            setLoadAttempt((attempt) => attempt + 1);
            return;
          }
          setError(nextError);
        }
      })
      .finally(() => {
        if (active && !retrying) setIsLoadingGame(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [difficulty, hardcore?.unlocked, loadAttempt]);

  useEffect(() => {
    if (!game) return;
    const historyKey = `${game.challenge.id}:${progress.playerId}`;
    if (hydratedHistoryKeys.current.has(historyKey)) return;
    hydratedHistoryKeys.current.add(historyKey);

    void apiClient.emojiCluesGuessHistory(game.challenge.id, progress.playerId).then((history) => {
      const restoredGuesses = history.guesses.map((guess) => ({
        id: guess.id,
        name: guess.name,
        isCorrect: guess.isCorrect,
      }));
      setGuesses(restoredGuesses);
      setGame((current) =>
        current && current.challenge.id === game.challenge.id
          ? { ...current, challenge: { ...current.challenge, clues: history.clues } }
          : current,
      );
      const cachedGame = gameCache.current[difficulty];
      if (cachedGame?.game.challenge.id === game.challenge.id) {
        gameCache.current[difficulty] = {
          ...cachedGame,
          guesses: restoredGuesses,
          game: {
            ...cachedGame.game,
            challenge: { ...cachedGame.game.challenge, clues: history.clues },
          },
        };
      }
    });
  }, [difficulty, game, progress.playerId]);

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
  const activeOption = available[activeOptionIndex] ?? available[0];
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
      guessFailureEntityId.current = null;
      guessFailureCount.current = 0;
      setQuery("");
      if (response.isCorrect) {
        const animationDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 3_200;
        completionTimer.current = window.setTimeout(() => {
          setShowCompletion(true);
          completionTimer.current = null;
        }, animationDuration);
      }
    } catch (nextError) {
      if (guessFailureEntityId.current !== entity.id) {
        guessFailureEntityId.current = entity.id;
        guessFailureCount.current = 0;
      }
      guessFailureCount.current += 1;
      setToast(
        nextError instanceof Error
          ? nextError.message
          : "We could not submit that guess. Please try again.",
      );
      if (guessFailureCount.current > 1) setError(nextError);
    } finally {
      setBusy(false);
    }
  };

  const completed = hardcore?.completedCategories ?? [];
  const date = game?.challenge.date ?? utcDate();
  const selectedPool = emojiCluePools.find((pool) => pool.difficulty === difficulty)!;
  return (
    <main className="page game-page emoji-clues-page">
      <SiteNavbar />
      <GameIntro
        completionCount={solved ? (game?.globalCompletionCount ?? null) : null}
        description="Use the visual clues to identify the hidden AI system, architecture, algorithm, or operator. Wrong guesses can reveal more clues."
        expiresAt={game?.challenge.expiresAt ?? null}
        eyebrow={<GameEyebrow date={date} game="Emoji Clues" variant={selectedPool.label} />}
        title="Guess today’s hidden AI idea"
        titleId="emoji-clues-title"
        difficulty={
          <DifficultySwitch
            ariaLabel="Emoji Clues difficulty"
            disabled={busy || isLoadingGame}
            onChange={(value) => setDifficulty(value as EmojiCluesDifficulty)}
            options={emojiCluePools
              .filter((pool) => pool.difficulty !== "hardcore" || hardcore?.unlocked)
              .map((pool) => ({ value: pool.difficulty, label: pool.label }))}
            selected={difficulty}
            testId="emoji-difficulty"
          />
        }
      />
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
            {Array.from({ length: game.challenge.maximumClues }, (_, index) => {
              const clue = game.challenge.clues[index];
              const revealed = Boolean(clue);
              return (
                <li
                  className={[
                    "emoji-clues__clue",
                    revealed ? " emoji-clues__clue--revealed" : " emoji-clues__clue--hidden",
                    solved ? " emoji-clues__clue--solved" : "",
                  ].join("")}
                  key={`${index}-${clueKey(clue)}`}
                  style={{ "--clue-index": index } as CSSProperties}
                >
                  <div className="emoji-clues__clue-inner">
                    <span
                      aria-hidden="true"
                      className="emoji-clues__clue-face emoji-clues__clue-cover"
                    >
                      ?
                    </span>
                    <span className="emoji-clues__clue-face emoji-clues__clue-result">
                      {clue?.type === "emoji" ? (
                        <span className="emoji-clues__glyph">{clue.value}</span>
                      ) : clue?.type === "icon" ? (
                        <EmojiClueIcon icon={clue.icon} />
                      ) : clue?.type === "image" ? (
                        <img alt={clue.alt ?? ""} loading="lazy" src={clue.src} />
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {!solved && (
            <form
              className="emoji-clues__search"
              onSubmit={(event) => {
                event.preventDefault();
                if (activeOption) void choose(activeOption);
              }}
            >
              <label htmlFor="emoji-clues-search">Name the answer</label>
              <div>
                <div className="emoji-clues__input">
                  <input
                    id="emoji-clues-search"
                    value={query}
                    disabled={busy}
                    aria-activedescendant={
                      available.length > 0 ? `emoji-clues-option-${activeOptionIndex}` : undefined
                    }
                    aria-autocomplete="list"
                    aria-controls="emoji-clues-options"
                    aria-expanded={available.length > 0}
                    role="combobox"
                    onChange={(event) => {
                      const nextQuery = event.target.value;
                      setQuery(nextQuery);
                      setActiveOptionIndex(0);
                      const cachedGame = gameCache.current[difficulty];
                      if (cachedGame) {
                        gameCache.current[difficulty] = { ...cachedGame, query: nextQuery };
                      }
                    }}
                    onKeyDown={(event) => {
                      if (available.length === 0) return;
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActiveOptionIndex((current) => (current + 1) % available.length);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActiveOptionIndex(
                          (current) => (current - 1 + available.length) % available.length,
                        );
                      } else if (event.key === "Enter" && activeOption) {
                        event.preventDefault();
                        void choose(activeOption);
                      }
                    }}
                    placeholder="GPT, BERT, K-Means…"
                  />
                  {available.length > 0 && (
                    <ul id="emoji-clues-options" role="listbox">
                      {available.map((entity, index) => (
                        <li
                          aria-selected={index === activeOptionIndex}
                          id={`emoji-clues-option-${index}`}
                          key={entity.id}
                          role="option"
                        >
                          <button type="button" onClick={() => void choose(entity)}>
                            <strong>{entity.name}</strong>
                            <small>{entity.entityKind.replaceAll("-", " ")}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button className="autocomplete__confirm" disabled={!activeOption || busy}>
                  Guess
                </button>
              </div>
            </form>
          )}
          {guesses.length > 0 && (
            <ol className="emoji-clues__history">
              {guesses.map((guess, index) => (
                <li
                  aria-label={
                    "Guess " +
                    (index + 1) +
                    ": " +
                    guess.name +
                    ", " +
                    (guess.isCorrect ? "correct" : "incorrect")
                  }
                  className={guess.isCorrect ? "is-correct" : "is-incorrect"}
                  key={guess.id}
                >
                  <span>{index + 1}</span>
                  <strong>{guess.name}</strong>
                </li>
              ))}
            </ol>
          )}
          {solved && !showCompletion && (
            <div className="game-completion-action">
              <button className="button" onClick={() => setShowCompletion(true)} type="button">
                Show winning guess
              </button>
            </div>
          )}
        </section>
      ) : null}
      {Boolean(error) && (
        <ApiUnavailableState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
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
      <EmojiHTP open={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
      {game && solved && showCompletion && (
        <Suspense fallback={null}>
          <EmojiCluesCompletedDialog
            difficulty={difficulty}
            guessCount={guesses.length}
            clueCount={game.challenge.clues.length}
            globalCompletionCount={game.globalCompletionCount}
            onClose={() => setShowCompletion(false)}
          />
        </Suspense>
      )}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
