"use client";

import { useEffect, useState } from "react";
import { FaCircleQuestion } from "react-icons/fa6";
import { GuessAutocomplete } from "./GuessAutocomplete";
import { GuessBoard } from "./GuessBoard";
import { DailyCountdown } from "./DailyCountdown";
import { GameCompletedDialog } from "./GameCompletedDialog";
import { HowToPlayDialog } from "./HowToPlayDialog";
import { useLocalProgress } from "../../lib/storage/use-local-progress";
import { updateProgress } from "../../lib/storage/local-progress-store";
import { applySolvedStreak } from "../../lib/domain/players/streak-service";
import type { PublicDailyChallengeDto } from "../../lib/domain/challenges/challenge-types";
import type { PublicModelIndex, ComparableModel } from "../../lib/domain/models/model-types";
import type { ClassicComparison } from "../../lib/domain/guesses/comparison-types";

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

type DailyPayload = { challenge: PublicDailyChallengeDto };
type ModelsPayload = { models: PublicModelIndex[] };
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

export function ClassicGame() {
  const progress = useLocalProgress();
  const [challenge, setChallenge] = useState<PublicDailyChallengeDto | null>(null);
  const [models, setModels] = useState<PublicModelIndex[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch("/api/challenges/today?mode=classic").then((r) => r.json() as Promise<DailyPayload>),
      fetch("/api/models").then((r) => r.json() as Promise<ModelsPayload>),
    ])
      .then(([daily, index]) => {
        setChallenge(daily.challenge);
        setModels(index.models);
      })
      .catch(() => setError("Could not load today’s game. Please try again."));
  }, []);

  const key = challenge ? `classic:${challenge.date}` : "";
  const game = key ? progress.games[key] : undefined;
  const guesses = (game?.guesses ?? []) as SavedGuess[];
  const guessed = new Set(guesses.map((g) => g.modelId));

  useEffect(() => {
    if (challenge && !progress.preferences.hasSeenClassicPrivacy) setShowHowToPlay(true);
  }, [challenge, progress.preferences.hasSeenClassicPrivacy]);

  const closeHowToPlay = () => {
    setShowHowToPlay(false);
    if (!progress.preferences.hasSeenClassicPrivacy)
      updateProgress((state) => ({
        ...state,
        preferences: { ...state.preferences, hasSeenClassicPrivacy: true },
      }));
  };

  useEffect(() => {
    if (game?.status !== "solved" || !game.completedAt) {
      setShowCompletion(false);
      return;
    }

    const revealDuration = 2_300;
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

    try {
      const response = await fetch(`/api/challenges/${challenge.id}/guess`, {
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
              mode: "classic",
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Guess failed. You can retry safely.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !challenge) return <p className="notice">{error}</p>;

  return (
    <main className="page game-page">
      <header className="game-header">
        <a href="/" className="brand">
          A<span>AI</span>dle
        </a>
        {challenge && <DailyCountdown expiresAt={challenge.expiresAt} />}
      </header>

      <section className="game-intro">
        <p className="eyebrow">Classic · {challenge?.date ?? "Loading"}</p>
        <h1>Guess today’s AI model</h1>
        <p className="lede">
          Use every comparison to narrow down the model. Green matches, amber overlaps, arrows point
          toward the answer.
        </p>

        {challenge && game?.status !== "solved" && (
          <>
            <GuessAutocomplete models={models} excluded={guessed} onPick={pick} />
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
          guesses={guesses.map((guess) => ({
            ...guess,
            matchingCategories: guess.matchingCategories ?? [],
            matchingInputModalities: guess.matchingInputModalities ?? [],
            matchingOutputModalities: guess.matchingOutputModalities ?? [],
            matchingUseCases: guess.matchingUseCases ?? [],
          }))}
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
