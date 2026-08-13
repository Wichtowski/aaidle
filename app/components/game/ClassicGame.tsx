"use client";

import { useEffect, useRef, useState } from "react";
import { FaCircleQuestion } from "react-icons/fa6";
import { apiClient, type ClassicGamePayload } from "../../../lib/api/client";
import { GuessBoard } from "./GuessBoard";
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
  focusedClassicCategories,
  type ClassicCategory,
  type ClassicDifficulty,
  type PublicModelIndex,
  type ComparableModel,
} from "../../../lib/domain/models/model-types";
import type { ClassicComparison } from "../../../lib/domain/guesses/comparison-types";
import { ClassicGameControls } from "./ClassicGameControls";
import { HardcoreAtmosphere } from "./HardcoreAtmosphere";
import { RitualGateDialog } from "./RitualGateDialog";
import {
  hasCompletedChallengeRitual,
  solvedChallengeCategoriesForDate,
} from "../../../lib/domain/games/classic/hardcore-unlock";

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

type GamePayload = ClassicGamePayload;

type PendingGuess = {
  requestId: string;
  model: PublicModelIndex;
};

const categoryRitualNotices: Record<Exclude<ClassicCategory, "hardcore">, string> = {
  llm: "The ledger has tasted a vast store of knowledge.",
  cv: "The ledger has opened its eyes to patterns in the dark.",
  nlp: "The ledger now understands the shape of natural language.",
  "object-detection": "The ledger is drawing boxes around things that should stay unseen.",
  "classical-ml": "The ledger has begun finding old patterns where there should be none.",
  filters: "The ledger now traces the edges hidden inside every image.",
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
  weightAvailability: "unknown",
  release: "unknown",
  contextWindowTokens: "unknown",
  supportedLanguages: "unknown", toolUse: "unknown", multimodal: "unknown", visionTasks: "unknown", architecture: "unknown", trainingDatasets: "unknown", license: "unknown", nlpTasks: "unknown", detectionTypes: "unknown", realTimeCapable: "unknown", algorithmTypes: "unknown", learningParadigms: "unknown", objectives: "unknown", featureTypes: "unknown", frameworks: "unknown", operationTypes: "unknown", kernelBased: "unknown", kernelSizes: "unknown", linearity: "unknown", requiresTraining: "unknown", outputTypes: "unknown",
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
  weightAvailability: null,
  categoryDetails: {},
  releaseYear: null,
  releaseDate: null,
  contextWindowTokens: null,
});

export function ClassicGame({
  category,
  difficulty,
  initialGame,
}: {
  category: ClassicCategory;
  difficulty: ClassicDifficulty;
  initialGame: GamePayload;
}) {
  const progress = useLocalProgress();
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulty);
  const [loadedDifficulty, setLoadedDifficulty] = useState(difficulty);
  const [challenge, setChallenge] = useState<PublicDailyChallengeDto | null>(initialGame.challenge);
  const [models, setModels] = useState<PublicModelIndex[]>(initialGame.models);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingGuess, setPendingGuess] = useState<PendingGuess | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [ritualGateReady, setRitualGateReady] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [animatedGuessId, setAnimatedGuessId] = useState<string | null>(null);
  const animatedGameKey = useRef<string | null>(null);
  const completionGameKey = useRef<string | null>(null);
  const ritualCompletionGameKey = useRef<string | null>(null);
  const loadedDifficultyRef = useRef(difficulty);
  const gameCache = useRef<Partial<Record<ClassicDifficulty, GamePayload>>>({ [difficulty]: initialGame });

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

    void apiClient
      .classicGame(category, selectedDifficulty, controller.signal)
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
  }, [category, selectedDifficulty]);

  const key = challenge
    ? `${classicChallengeMode(category, loadedDifficulty)}:${challenge.date}`
    : "";
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
    if (progressReady && challenge && !progress.preferences.hasSeenClassicPrivacy) {
      setShowHowToPlay(true);
    }
  }, [challenge, progress.preferences.hasSeenClassicPrivacy, progressReady]);

  const closeHowToPlay = () => {
    setShowHowToPlay(false);
    if (!progress.preferences.hasSeenClassicPrivacy) {
      updateProgress((state) => ({
        ...state,
        preferences: { ...state.preferences, hasSeenClassicPrivacy: true },
      }));
    }
  };

  const solvedChallengeCount = challenge
    ? solvedChallengeCategoriesForDate(progress, challenge.date).length
    : 0;
  const showCategoryRitualNotice = Boolean(
    category !== "hardcore" &&
      loadedDifficulty === "challenge" &&
      game?.status === "solved" &&
      solvedChallengeCount > 0 &&
      !hasCompletedChallengeRitual(progress, challenge?.date ?? ""),
  );
  const ritualGateActive = Boolean(
    challenge &&
      category !== "hardcore" &&
      !progress.preferences.hardcoreUnlocked &&
      hasCompletedChallengeRitual(progress, challenge.date),
  );

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
    completionGameKey.current = null;
    setShowCompletion(false);
    setDifficultyPreference(nextDifficulty);
    setIsLoadingGame(true);
    setSelectedDifficulty(nextDifficulty);
  };

  useEffect(() => {
    if (
      ritualCompletionGameKey.current === key ||
      completionGameKey.current !== key ||
      game?.status !== "solved" ||
      !game.completedAt
    ) {
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

  useEffect(() => {
    if (!ritualGateActive) {
      setRitualGateReady(false);
      return;
    }

    const delay = ritualCompletionGameKey.current === key ? 2_900 : 0;
    const timer = window.setTimeout(() => setRitualGateReady(true), delay);
    return () => window.clearTimeout(timer);
  }, [key, ritualGateActive]);

  const pick = async (model: PublicModelIndex) => {
    if (!challenge || busy || guessed.has(model.id) || game?.status === "solved") return;

    setBusy(true);
    setError(null);
    const requestId = crypto.randomUUID();
    const attemptNumber = guesses.length + 1;
    setAnimatedGuessId(requestId);
    setPendingGuess({ requestId, model });

    try {
      const payload = await apiClient.submitClassicGuess(challenge.id, model.id, attemptNumber);

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

      if (entry.isCorrect) completionGameKey.current = key;

      updateProgress((state) => {
        const old = state.games[key];
        const games = {
          ...state.games,
          [key]: {
            challengeId: challenge.id,
            challengeDate: challenge.date,
            mode: classicChallengeMode(category, loadedDifficulty),
            status: entry.isCorrect ? ("solved" as const) : ("in-progress" as const),
            guesses: [...(old?.guesses ?? []), entry],
            startedAt: old?.startedAt ?? entry.attemptedAt,
            completedAt: entry.isCorrect ? entry.attemptedAt : null,
          },
        };
        const nextState = { ...state, games };

        if (
          entry.isCorrect &&
          loadedDifficulty === "challenge" &&
          !state.preferences.hardcoreUnlocked &&
          hasCompletedChallengeRitual(nextState, challenge.date)
        ) {
          ritualCompletionGameKey.current = key;
        }

        return {
          ...state,
          games,
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

  if (category === "hardcore" && !progress.preferences.hardcoreUnlocked) {
    return (
      <main className="page game-page game-page--locked">
        <SiteNavbar />
        <section className="hardcore-lock" aria-labelledby="hardcore-lock-title">
          <p className="eyebrow">Sealed</p>
          <h1 id="hardcore-lock-title">Nothing answers.</h1>
          <p>The catalogue is quieter than it should be.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={`page game-page${category === "hardcore" ? " game-page--hardcore" : ""}`}>
      {category === "hardcore" && <HardcoreAtmosphere />}
      <SiteNavbar hardcore={category === "hardcore"} />

      <ClassicGameControls category={category} date={challenge?.date ?? null} expiresAt={challenge?.expiresAt ?? null} models={models} difficulty={selectedDifficulty} loading={isLoadingGame} busy={busy} canGuess={game?.status !== "solved"} guessed={guessed} onDifficultyChange={selectDifficulty} onPick={pick} />
      {error && <p role="alert" className="notice">{error}</p>}

      {challenge && (
        <GuessBoard
          category={category}
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

      <HowToPlayDialog category={category} open={showHowToPlay} onClose={closeHowToPlay} />
      {ritualGateReady && <RitualGateDialog />}
      {challenge && game?.status === "solved" && showCompletion && ritualCompletionGameKey.current !== key && (
        <GameCompletedDialog
          date={challenge.date}
          category={category}
          difficulty={loadedDifficulty}
          guesses={guesses}
          ritualNotice={
            showCategoryRitualNotice
              ? `${categoryRitualNotices[category as Exclude<ClassicCategory, "hardcore">]} The ledger recorded ${solvedChallengeCount}/${focusedClassicCategories.length} seals today. Check your profile.`
              : undefined
          }
          onClose={() => setShowCompletion(false)}
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
