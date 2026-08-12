"use client";

import { useEffect, useRef, useState } from "react";
import { FaCircleQuestion } from "react-icons/fa6";
import { GuessAutocomplete } from "./GuessAutocomplete";
import { GuessBoard } from "./GuessBoard";
import { DailyCountdown } from "./DailyCountdown";
import { SiteNavbar } from "../ui/SiteNavbar";
import { GameCompletedDialog } from "./GameCompletedDialog";
import { HowToPlayDialog } from "./HowToPlayDialog";
import { useLocalProgress } from "../../../lib/storage/use-local-progress";
import { updateProgress } from "../../../lib/storage/local-progress-store";
import { applySolvedStreak } from "../../../lib/domain/players/streak-service";
import {
  classicDifficultyCookieMaxAge,
  classicDifficultyCookieName,
} from "../../../lib/domain/games/classic/difficulty-preference";
import type { PublicDailyChallengeDto } from "../../../lib/domain/challenges/challenge-types";
import {
  classicChallengeMode,
  type ClassicDifficulty,
  type PublicModelIndex,
  type ComparableModel,
} from "../../../lib/domain/models/model-types";
import type { ClassicComparison } from "../../../lib/domain/guesses/comparison-types";

type SavedGuess = {
  requestId: string;
  modelId: string;
  modelName: string;
  attemptedAt: string;
  attemptNumber: number;
  isCorrect: boolean;
  sameGuessCount: number;
  matchingCategories: string[];
  matchingInputModalities: string[];
  matchingOutputModalities: string[];
  matchingUseCases: string[];
  model: ComparableModel;
  comparison: ClassicComparison;
};

type GamePayload = { challenge: PublicDailyChallengeDto; models: PublicModelIndex[] };
type GuessPayload = {
  guess: {
    isCorrect: boolean;
    sameGuessCount: number;
    matchingCategories: string[];
    matchingInputModalities: string[];
    matchingOutputModalities: string[];
    matchingUseCases: string[];
    model: ComparableModel;
    comparison: ClassicComparison;
  };
  error?: { message: string };
};

type PendingGuess = {
  requestId: string;
  model: PublicModelIndex;
};

const coveredComparison: ClassicComparison = {
  provider: "unknown",
  country: "unknown",
  family: "unknown",
  categories: "unknown",
  inputModalities: "unknown",
  outputModalities: "unknown",
  useCases: "unknown",
  reasoningSupport: "unknown",
  openWeights: "unknown",
  localExecution: "unknown",
  releaseYear: "unknown",
  contextWindowTokens: "unknown",
};

const coveredModel = (model: PublicModelIndex): ComparableModel => ({
  id: model.id,
  name: model.name,
  provider: null,
  country: null,
  family: null,
  categories: null,
  inputModalities: null,
  outputModalities: null,
  useCases: null,
  reasoningSupport: null,
  openWeights: null,
  localExecution: null,
  releaseYear: null,
  releaseDate: null,
  contextWindowTokens: null,
});

const difficultyLabels: Record<ClassicDifficulty, string> = {
  normal: "Normal",
  challenge: "Challenge",
  hardcore: "Hardcore",
};

const difficultyApiPaths: Record<ClassicDifficulty, string> = {
  normal: "/api/v1/games/classic/normal",
  challenge: "/api/v1/games/classic/challenge",
  hardcore: "/api/v1/games/classic/hardcore",
};

export function ClassicGame({ difficulty }: { difficulty: ClassicDifficulty }) {
  const progress = useLocalProgress();
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulty);
  const [loadedDifficulty, setLoadedDifficulty] = useState(difficulty);
  const [challenge, setChallenge] = useState<PublicDailyChallengeDto | null>(null);
  const [models, setModels] = useState<PublicModelIndex[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingGuess, setPendingGuess] = useState<PendingGuess | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [animatedGuessId, setAnimatedGuessId] = useState<string | null>(null);
  const animatedGameKey = useRef<string | null>(null);
  const loadedDifficultyRef = useRef(difficulty);
  const gameCache = useRef<Partial<Record<ClassicDifficulty, GamePayload>>>({});

  useEffect(() => {
    const cachedGame = gameCache.current[selectedDifficulty];

    if (cachedGame) {
      setChallenge(cachedGame.challenge);
      setModels(cachedGame.models);
      setLoadedDifficulty(selectedDifficulty);
      loadedDifficultyRef.current = selectedDifficulty;
      setIsLoadingGame(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoadingGame(true);
    setError(null);

    void fetch(difficultyApiPaths[selectedDifficulty], { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load today’s game.");
        return response.json() as Promise<GamePayload>;
      })
      .then((game) => {
        gameCache.current[selectedDifficulty] = game;
        setChallenge(game.challenge);
        setModels(game.models);
        setLoadedDifficulty(selectedDifficulty);
        loadedDifficultyRef.current = selectedDifficulty;
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setSelectedDifficulty(loadedDifficultyRef.current);
        setError(fetchError instanceof Error ? fetchError.message : "Could not load today’s game.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingGame(false);
      });

    return () => controller.abort();
  }, [selectedDifficulty]);

  const key = challenge ? `classic:${loadedDifficulty}:${challenge.date}` : "";
  const game = key ? progress.games[key] : undefined;
  const guesses = (game?.guesses ?? []) as SavedGuess[];
  const guessed = new Set([
    ...guesses.map((guess) => guess.modelId),
    ...(pendingGuess ? [pendingGuess.model.id] : []),
  ]);

  useEffect(() => {
    setProgressReady(true);
  }, []);

  useEffect(() => {
    if (!progressReady || !key || animatedGameKey.current === key) return;

    animatedGameKey.current = key;
    setAnimatedGuessId(guesses.at(-1)?.requestId ?? null);
  }, [guesses, key, progressReady]);

  useEffect(() => {
    if (challenge && !progress.preferences.hasSeenClassicPrivacy) setShowHowToPlay(true);
  }, [challenge, progress.preferences.hasSeenClassicPrivacy]);

  const closeHowToPlay = () => {
    setShowHowToPlay(false);
    if (!progress.preferences.hasSeenClassicPrivacy) {
      updateProgress((state) => ({
        ...state,
        preferences: { ...state.preferences, hasSeenClassicPrivacy: true },
      }));
    }
  };

  const setDifficultyPreference = (nextDifficulty: ClassicDifficulty) => {
    document.cookie = [
      `${classicDifficultyCookieName}=${nextDifficulty}`,
      "Path=/",
      `Max-Age=${classicDifficultyCookieMaxAge}`,
      "SameSite=Lax",
    ].join("; ");
  };

  const selectDifficulty = (nextDifficulty: ClassicDifficulty) => {
    if (nextDifficulty === selectedDifficulty) return;
    setDifficultyPreference(nextDifficulty);
    setIsLoadingGame(true);
    setSelectedDifficulty(nextDifficulty);
  };

  useEffect(() => {
    if (game?.status !== "solved" || !game.completedAt) {
      setShowCompletion(false);
      return;
    }

    const revealDuration = 2_900;
    const elapsed = Date.now() - new Date(game.completedAt).getTime();
    const timer = window.setTimeout(
      () => setShowCompletion(true),
      Math.max(0, revealDuration - elapsed),
    );

    return () => window.clearTimeout(timer);
  }, [game?.completedAt, game?.status]);

  const pick = async (model: PublicModelIndex) => {
    if (!challenge || busy || guessed.has(model.id) || game?.status === "solved") return;

    setBusy(true);
    setError(null);
    const requestId = crypto.randomUUID();
    const attemptNumber = guesses.length + 1;
    setAnimatedGuessId(requestId);
    setPendingGuess({ requestId, model });

    try {
      const response = await fetch(`/api/v1/games/classic/challenges/${challenge.id}/guesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guessedModelId: model.id,
          attemptNumber,
        }),
      });
      const payload = (await response.json()) as GuessPayload;
      if (!response.ok) throw new Error(payload.error?.message ?? "Guess failed");

      const entry: SavedGuess = {
        requestId,
        modelId: model.id,
        modelName: model.name,
        attemptedAt: new Date().toISOString(),
        attemptNumber,
        isCorrect: payload.guess.isCorrect,
        sameGuessCount: payload.guess.sameGuessCount,
        matchingCategories: payload.guess.matchingCategories,
        matchingInputModalities: payload.guess.matchingInputModalities,
        matchingOutputModalities: payload.guess.matchingOutputModalities,
        matchingUseCases: payload.guess.matchingUseCases,
        model: payload.guess.model,
        comparison: payload.guess.comparison,
      };

      updateProgress((state) => {
        const old = state.games[key];

        return {
          ...state,
          games: {
            ...state.games,
            [key]: {
              challengeId: challenge.id,
              challengeDate: challenge.date,
              mode: classicChallengeMode(loadedDifficulty),
              status: entry.isCorrect ? "solved" : "in-progress",
              guesses: [...(old?.guesses ?? []), entry],
              startedAt: old?.startedAt ?? entry.attemptedAt,
              completedAt: entry.isCorrect ? entry.attemptedAt : null,
            },
          },
          stats: entry.isCorrect
            ? (() => {
                const current = state.stats.classic;
                const streak = applySolvedStreak(
                  {
                    currentStreak: current.currentStreak,
                    bestStreak: current.bestStreak,
                    lastSolvedDate: current.lastSolvedDate,
                  },
                  challenge.date,
                );
                const guessDistribution = { ...current.guessDistribution };
                const bucket = entry.attemptNumber > 9 ? "10+" : String(entry.attemptNumber);
                guessDistribution[bucket] = (guessDistribution[bucket] ?? 0) + 1;
                return {
                  ...state.stats,
                  classic: {
                    ...current,
                    ...streak,
                    gamesPlayed: current.gamesPlayed + 1,
                    gamesWon: current.gamesWon + 1,
                    lastPlayedDate: challenge.date,
                    guessDistribution,
                  },
                };
              })()
            : state.stats,
        };
      });
      setPendingGuess(null);
    } catch (e) {
      setPendingGuess(null);
      setError(e instanceof Error ? e.message : "Guess failed. You can retry safely.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !challenge) return <p className="notice">{error}</p>;

  return (
    <main className="page game-page">
      <SiteNavbar />

      <section className="game-intro">
        <div className="game-intro__meta">
          <p className="eyebrow">Classic · {challenge?.date ?? "Loading"}</p>
          {challenge && <DailyCountdown expiresAt={challenge.expiresAt} />}
        </div>
        <h1>Guess today’s AI model</h1>
        <p className="lede">
          Every model leaves a trail. Follow it until the answer reveals itself.
        </p>

        <div aria-busy={isLoadingGame} className="game-intro__difficulty">
          <span>Difficulty</span>
          <div className="difficulty-switch" aria-label="Classic difficulty" role="group">
            {(["normal", "challenge", "hardcore"] as const).map((option) => (
              <button
                aria-pressed={option === selectedDifficulty}
                disabled={isLoadingGame && option !== selectedDifficulty}
                key={option}
                onClick={() => selectDifficulty(option)}
                type="button"
              >
                {difficultyLabels[option]}
              </button>
            ))}
          </div>
        </div>

        {challenge && game?.status !== "solved" && (
          <>
            <GuessAutocomplete
              disabled={busy || isLoadingGame}
              models={models}
              excluded={guessed}
              onPick={pick}
            />
          </>
        )}

        {busy && (
          <p aria-live="polite" className="attempts">
            Checking…
          </p>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
      </section>

      {challenge && (
        <GuessBoard
          difficulty={selectedDifficulty}
          guesses={[
            ...guesses.map((guess) => ({
              ...guess,
              animate: guess.requestId === animatedGuessId,
              revealed: true,
              showCards: true,
              matchingCategories: guess.matchingCategories ?? [],
              matchingInputModalities: guess.matchingInputModalities ?? [],
              matchingOutputModalities: guess.matchingOutputModalities ?? [],
              matchingUseCases: guess.matchingUseCases ?? [],
            })),
            ...(pendingGuess
              ? [
                  {
                    requestId: pendingGuess.requestId,
                    model: coveredModel(pendingGuess.model),
                    comparison: coveredComparison,
                    animate: false,
                    revealed: false,
                    showCards: false,
                    matchingCategories: [],
                    matchingInputModalities: [],
                    matchingOutputModalities: [],
                    matchingUseCases: [],
                  },
                ]
              : []),
          ]}
        />
      )}

      <button
        aria-label="How to play"
        className="game-help__button game-help__button--floating"
        onClick={() => setShowHowToPlay(true)}
      >
        <FaCircleQuestion aria-hidden focusable="false" />
      </button>

      <HowToPlayDialog open={showHowToPlay} onClose={closeHowToPlay} />
      {challenge && game?.status === "solved" && showCompletion && (
        <GameCompletedDialog
          date={challenge.date}
          guesses={guesses}
          stats={{
            currentStreak: progress.stats.classic.currentStreak,
            bestStreak: progress.stats.classic.bestStreak,
            gamesPlayed: progress.stats.classic.gamesPlayed,
          }}
        />
      )}
    </main>
  );
}
