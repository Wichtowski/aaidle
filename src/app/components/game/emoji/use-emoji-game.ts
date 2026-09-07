import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiClient,
  isApiUnavailable,
  type EmojiDifficulty,
  type EmojiGamePayload,
} from "@lib/api/client";
import { useLocalProgress } from "@lib/storage/use-local-progress";

export type EmojiGuess = { id: string; name: string; isCorrect: boolean };
type CachedGame = { game: EmojiGamePayload; guesses: EmojiGuess[]; query: string };

export function useEmojiGame(difficulty: EmojiDifficulty) {
  const progress = useLocalProgress();
  const [game, setGame] = useState<EmojiGamePayload | null>(null);
  const [guesses, setGuesses] = useState<EmojiGuess[]>([]);
  const [queryState, setQueryState] = useState("");
  const [busy, setBusy] = useState(false);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hardcore, setHardcore] = useState<{
    signedIn: boolean;
    unlocked: boolean;
    completedCategories: string[];
    requiredCategories: string[];
  } | null>(null);
  const gameCache = useRef<Partial<Record<EmojiDifficulty, CachedGame>>>({});
  const hydratedHistoryKeys = useRef(new Set<string>());
  const loadFailureKey = useRef<EmojiDifficulty | null>(null);
  const loadFailureCount = useRef(0);
  const guessFailureEntityId = useRef<string | null>(null);
  const guessFailureCount = useRef(0);
  const completionTimer = useRef<number | null>(null);

  const setQuery = (query: string) => {
    setQueryState(query);
    const cachedGame = gameCache.current[difficulty];
    if (cachedGame) gameCache.current[difficulty] = { ...cachedGame, query };
  };

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
      setQueryState(cachedGame.query);
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
      .emojiGame(difficulty, controller.signal)
      .then((nextGame) => {
        if (!active) return;
        loadFailureCount.current = 0;
        gameCache.current[difficulty] = { game: nextGame, guesses: [], query: "" };
        setGame(nextGame);
      })
      .catch((nextError: unknown) => {
        if (!active || (nextError instanceof DOMException && nextError.name === "AbortError")) {
          return;
        }
        if (isApiUnavailable(nextError) && loadFailureCount.current === 0) {
          loadFailureCount.current += 1;
          retrying = true;
          setToast("The game is temporarily unavailable. Retrying now.");
          setLoadAttempt((attempt) => attempt + 1);
          return;
        }
        setError(nextError);
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
    void apiClient.emojiGuessHistory(game.challenge.id, progress.playerId).then((history) => {
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
    const normalized = queryState.trim().toLocaleLowerCase("en-US");
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
  }, [game, guesses, queryState]);
  const solved = guesses.some((guess) => guess.isCorrect);

  const choose = async (entity: EmojiGamePayload["entities"][number]) => {
    if (!game || busy || solved) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiClient.submitEmojiGuess(
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
          gameCache.current[difficulty] = {
            ...cachedGame,
            guesses: nextGuesses,
            query: "",
          };
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
          gameCache.current[difficulty] = {
            ...cachedGame,
            game: nextGame,
            query: "",
          };
        }
        return nextGame;
      });
      guessFailureEntityId.current = null;
      guessFailureCount.current = 0;
      setQueryState("");
      if (response.isCorrect) {
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 3_200;
        completionTimer.current = window.setTimeout(() => {
          setShowCompletion(true);
          completionTimer.current = null;
        }, duration);
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

  return {
    available,
    busy,
    choose,
    error,
    game,
    guesses,
    hardcore,
    isLoadingGame,
    query: queryState,
    setLoadAttempt,
    setQuery,
    setShowCompletion,
    setToast,
    showCompletion,
    solved,
    toast,
  };
}
