import { useEffect, useRef, useState } from "react";
import { apiClient, isApiUnavailable, type ClassicGamePayload } from "@lib/api/client";
import type { ClassicCategory, ClassicDifficulty } from "@lib/domain/models/model-types";

type Options = {
  category: ClassicCategory;
  difficulty: ClassicDifficulty;
  hasHardcoreAccess: boolean;
  initialGame: ClassicGamePayload | null;
  onRetryNotice: (message: string) => void;
};

export function useClassicGameLoader({
  category,
  difficulty,
  hasHardcoreAccess,
  initialGame,
  onRetryNotice,
}: Options) {
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulty);
  const [loadedDifficulty, setLoadedDifficulty] = useState(difficulty);
  const [challenge, setChallenge] = useState(initialGame?.challenge ?? null);
  const [models, setModels] = useState(initialGame?.models ?? []);
  const [columns, setColumns] = useState(initialGame?.columns ?? []);
  const [globalCompletionCount, setGlobalCompletionCount] = useState(
    initialGame?.globalCompletionCount ?? 0,
  );
  const [error, setError] = useState<unknown>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loadedDifficultyRef = useRef(difficulty);
  const loadFailureKey = useRef<string | null>(null);
  const loadFailureCount = useRef(0);
  const previousRoute = useRef({ category, difficulty });
  const gameCache = useRef<
    Partial<Record<ClassicCategory, Partial<Record<ClassicDifficulty, ClassicGamePayload>>>>
  >(initialGame ? { [category]: { [difficulty]: initialGame } } : {});

  useEffect(() => {
    const previous = previousRoute.current;
    if (previous.category === category && previous.difficulty === difficulty) return;
    previousRoute.current = { category, difficulty };
    setSelectedDifficulty(difficulty);
    setLoadedDifficulty(difficulty);
    setChallenge(null);
    setModels([]);
    setColumns([]);
    setError(null);
  }, [category, difficulty]);

  useEffect(() => {
    if (category === "hardcore" && !hasHardcoreAccess) return;
    const currentLoadKey = `${category}:${selectedDifficulty}`;
    if (loadFailureKey.current !== currentLoadKey) {
      loadFailureKey.current = currentLoadKey;
      loadFailureCount.current = 0;
    }
    const cachedGame = gameCache.current[category]?.[selectedDifficulty];
    if (cachedGame) {
      setChallenge(cachedGame.challenge);
      setModels(cachedGame.models);
      setColumns(cachedGame.columns);
      setGlobalCompletionCount(cachedGame.globalCompletionCount);
      setLoadedDifficulty(selectedDifficulty);
      loadedDifficultyRef.current = selectedDifficulty;
      setIsLoadingGame(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let retrying = false;
    setIsLoadingGame(true);
    setError(null);
    void apiClient
      .classicGame(category, selectedDifficulty, controller.signal)
      .then((game) => {
        if (controller.signal.aborted) return;
        loadFailureCount.current = 0;
        (gameCache.current[category] ??= {})[selectedDifficulty] = game;
        setChallenge(game.challenge);
        setModels(game.models);
        setColumns(game.columns);
        setGlobalCompletionCount(game.globalCompletionCount);
        setLoadedDifficulty(selectedDifficulty);
        loadedDifficultyRef.current = selectedDifficulty;
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        if (isApiUnavailable(fetchError) && loadFailureCount.current === 0) {
          loadFailureCount.current += 1;
          retrying = true;
          onRetryNotice(
            fetchError instanceof Error
              ? fetchError.message
              : "We could not load today’s game. Retrying now.",
          );
          setLoadAttempt((attempt) => attempt + 1);
          return;
        }
        setSelectedDifficulty(loadedDifficultyRef.current);
        setError(fetchError);
      })
      .finally(() => {
        if (!controller.signal.aborted && !retrying) setIsLoadingGame(false);
      });
    return () => controller.abort();
  }, [category, hasHardcoreAccess, loadAttempt, onRetryNotice, selectedDifficulty]);

  return {
    challenge,
    columns,
    error,
    globalCompletionCount,
    isLoadingGame,
    loadedDifficulty,
    models,
    selectedDifficulty,
    setError,
    setGlobalCompletionCount,
    setIsLoadingGame,
    setLoadAttempt,
    setSelectedDifficulty,
  };
}
