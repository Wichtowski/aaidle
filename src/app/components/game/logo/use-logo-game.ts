import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiClient, type LogoGamePayload, type LogoModel } from "@lib/api/client";
import { useLocalProgress } from "@lib/storage/use-local-progress";

export type LogoGuess = { model: LogoModel; isCorrect: boolean; attemptNumber: number };

export function useLogoGame() {
  const localProgress = useLocalProgress();
  const [game, setGame] = useState<LogoGamePayload | null>(null);
  const [guesses, setGuesses] = useState<LogoGuess[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);
  const hydratedChallenge = useRef<string | null>(null);
  const completionTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    void apiClient
      .logoGame(localProgress.playerId, controller.signal)
      .then(async (nextGame) => {
        if (!active) return;
        setGame(nextGame);
        if (hydratedChallenge.current === nextGame.challenge.id) return;
        const history = await apiClient.logoGuessHistory(
          nextGame.challenge.id,
          localProgress.playerId,
        );
        if (!active) return;
        hydratedChallenge.current = nextGame.challenge.id;
        setGuesses(history.guesses);
        setGame((current) =>
          current?.challenge.id === nextGame.challenge.id
            ? { ...current, progress: history.progress }
            : current,
        );
      })
      .catch((nextError: unknown) => {
        if (nextError instanceof DOMException && nextError.name === "AbortError") return;
        if (active) setError(nextError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadAttempt, localProgress.playerId]);

  const available = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en-US");
    if (!normalized || !game) return [];
    return game.models
      .filter(
        (model) =>
          !guesses.some((guess) => guess.model.id === model.id) &&
          [model.name, ...model.aliases].some((value) =>
            value.toLocaleLowerCase("en-US").includes(normalized),
          ),
      )
      .slice(0, 8);
  }, [game, guesses, query]);
  const solved = game?.progress.solved ?? false;

  const choose = async (model: LogoModel) => {
    if (!game || busy || solved) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiClient.submitLogoGuess(
        game.challenge.id,
        localProgress.playerId,
        crypto.randomUUID(),
        model.id,
        guesses.length + 1,
      );
      setGuesses((current) => [
        ...current,
        {
          model: response.guessedModel,
          isCorrect: response.isCorrect,
          attemptNumber: response.attemptNumber,
        },
      ]);
      setGame((current) =>
        current
          ? {
              ...current,
              globalCompletionCount: response.globalCompletionCount,
              progress: response.progress,
            }
          : current,
      );
      setQuery("");
      if (response.isCorrect) {
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 3_200;
        completionTimer.current = window.setTimeout(() => {
          setShowCompletion(true);
          completionTimer.current = null;
        }, duration);
      }
    } catch (nextError) {
      if (
        nextError instanceof ApiError &&
        ["DUPLICATE_GUESS", "STALE_GUESS_STATE", "CHALLENGE_COMPLETED"].includes(
          nextError.code ?? "",
        )
      ) {
        try {
          const history = await apiClient.logoGuessHistory(
            game.challenge.id,
            localProgress.playerId,
          );
          setGuesses(history.guesses);
          setGame((current) =>
            current?.challenge.id === game.challenge.id
              ? { ...current, progress: history.progress }
              : current,
          );
          setQuery("");
          setToast("Your saved guesses were restored.");
          return;
        } catch (restoreError) {
          setToast(
            restoreError instanceof Error
              ? restoreError.message
              : "We could not restore your saved guesses. Please try again.",
          );
          return;
        }
      }
      setToast(
        nextError instanceof Error
          ? nextError.message
          : "We could not submit that guess. Please try again.",
      );
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
    loading,
    query,
    setLoadAttempt,
    setQuery,
    setToast,
    setShowCompletion,
    showCompletion,
    solved,
    toast,
  };
}
