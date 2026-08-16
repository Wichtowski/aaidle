import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaCircleQuestion } from "react-icons/fa6";
import { ApiError, apiClient, isApiUnavailable, type ClassicGamePayload } from "@lib/api/client";
import { GuessBoard } from "./GuessBoard";
import { SiteNavbar } from "../ui/SiteNavbar";
import { HowToPlayDialog } from "./HowToPlayDialog";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { updateProgress } from "@lib/storage/local-progress-store";
import { useAuth } from "../auth/useAuth";
import { applySolvedStreak } from "@lib/domain/players/streak-service";
import {
  classicDifficultyCookieMaxAge,
  classicDifficultyCookieName,
} from "@lib/domain/games/classic/difficulty-preference";
import type { PublicDailyChallengeDto } from "@lib/domain/challenges/challenge-types";
import {
  classicChallengeMode,
  focusedClassicCategories,
  type ClassicCategory,
  type ClassicDifficulty,
  type PublicModelIndex,
  type ComparableModel,
} from "@lib/domain/models/model-types";
import type { ClassicComparison } from "@lib/domain/guesses/comparison-types";
import { ClassicGameControls } from "./ClassicGameControls";
import { HardcoreAtmosphere } from "./HardcoreAtmosphere";
import { HardcoreSoundtrack } from "./HardcoreSoundtrack";
import { RitualGateDialog } from "./RitualGateDialog";
import { ApiUnavailableState } from "../ui/ApiUnavailableState";
import {
  hasCompletedChallengeRitual,
  solvedChallengeCategoriesForDate,
} from "@lib/domain/games/classic/hardcore-unlock";

const GameCompletedDialog = lazy(() =>
  import("./GameCompletedDialog").then(({ GameCompletedDialog }) => ({
    default: GameCompletedDialog,
  })),
);

type SavedGuess = {
  requestId: string;
  modelId: string;
  modelName: string;
  attemptedAt: string;
  attemptNumber: number;
  isCorrect: boolean;
  sameGuessCount: number;
  trajectoryAccessToken?: string;
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
  supportedLanguages: "unknown",
  toolUse: "unknown",
  multimodal: "unknown",
  visionTasks: "unknown",
  architecture: "unknown",
  trainingDatasets: "unknown",
  license: "unknown",
  nlpTasks: "unknown",
  detectionTypes: "unknown",
  realTimeCapable: "unknown",
  algorithmTypes: "unknown",
  learningParadigms: "unknown",
  objectives: "unknown",
  featureTypes: "unknown",
  frameworks: "unknown",
  operationTypes: "unknown",
  kernelBased: "unknown",
  kernelSizes: "unknown",
  linearity: "unknown",
  requiresTraining: "unknown",
  outputTypes: "unknown",
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
  initialGame = null,
  hasHardcoreAccess,
}: {
  category: ClassicCategory;
  difficulty: ClassicDifficulty;
  initialGame?: GamePayload | null;
  hasHardcoreAccess: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const progress = useLocalProgress();
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulty);
  const [loadedDifficulty, setLoadedDifficulty] = useState(difficulty);
  const [challenge, setChallenge] = useState<PublicDailyChallengeDto | null>(
    initialGame?.challenge ?? null,
  );
  const [models, setModels] = useState<PublicModelIndex[]>(initialGame?.models ?? []);
  const [columns, setColumns] = useState<string[]>(initialGame?.columns ?? []);
  const [globalCompletionCount, setGlobalCompletionCount] = useState(
    initialGame?.globalCompletionCount ?? 0,
  );
  const [error, setError] = useState<unknown>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingGuess, setPendingGuess] = useState<PendingGuess | null>(null);
  const [retryGuess, setRetryGuess] = useState<PendingGuess | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showRitualGate, setShowRitualGate] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [animatedGuessId, setAnimatedGuessId] = useState<string | null>(null);
  const animatedGameKey = useRef<string | null>(null);
  const completionGameKey = useRef<string | null>(null);
  const loadedDifficultyRef = useRef(difficulty);
  const gameCache = useRef<Partial<Record<ClassicDifficulty, GamePayload>>>(
    initialGame ? { [difficulty]: initialGame } : {},
  );

  useEffect(() => {
    if (category === "hardcore" && !hasHardcoreAccess) return;
    const cachedGame = gameCache.current[selectedDifficulty];

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
    setIsLoadingGame(true);
    setError(null);

    void apiClient
      .classicGame(category, selectedDifficulty, controller.signal)
      .then((game) => {
        gameCache.current[selectedDifficulty] = game;
        setChallenge(game.challenge);
        setModels(game.models);
        setColumns(game.columns);
        setGlobalCompletionCount(game.globalCompletionCount);
        setLoadedDifficulty(selectedDifficulty);
        loadedDifficultyRef.current = selectedDifficulty;
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setSelectedDifficulty(loadedDifficultyRef.current);
        setError(fetchError);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingGame(false);
      });

    return () => controller.abort();
  }, [category, hasHardcoreAccess, loadAttempt, selectedDifficulty]);

  const key = challenge
    ? `${classicChallengeMode(category, loadedDifficulty)}:${challenge.date}`
    : "";
  const game = key ? progress.games[key] : undefined;
  const innerCircleActive = progress.preferences.innerCircleActive;
  const guesses = (game?.guesses ?? []) as SavedGuess[];
  const guessed = new Set([
    ...guesses.map((guess) => guess.modelId),
    ...(pendingGuess ? [pendingGuess.model.id] : []),
    ...(retryGuess ? [retryGuess.model.id] : []),
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
    if (progressReady && challenge && !progress.preferences.hasSeenClassicHowToPlay) {
      setShowHowToPlay(true);
    }
  }, [challenge, progress.preferences.hasSeenClassicHowToPlay, progressReady]);

  useEffect(() => {
    if (innerCircleActive && category !== "hardcore") navigate("/classic/hardcore", { replace: true });
  }, [category, innerCircleActive, navigate]);

  const closeHowToPlay = () => {
    setShowHowToPlay(false);
    if (!progress.preferences.hasSeenClassicHowToPlay) {
      updateProgress((state) => ({
        ...state,
        preferences: { ...state.preferences, hasSeenClassicHowToPlay: true },
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
  const canEnterInnerCircle = Boolean(
    challenge &&
    category !== "hardcore" &&
    loadedDifficulty === "challenge" &&
    game?.status === "solved" &&
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
    setShowRitualGate(false);
    setDifficultyPreference(nextDifficulty);
    setIsLoadingGame(true);
    setSelectedDifficulty(nextDifficulty);
  };

  useEffect(() => {
    if (completionGameKey.current !== key || game?.status !== "solved" || !game.completedAt) {
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

  const pick = async (model: PublicModelIndex, requestId: string = crypto.randomUUID()) => {
    const isRetry = retryGuess?.requestId === requestId;
    if (!challenge || busy || (guessed.has(model.id) && !isRetry) || game?.status === "solved") return;

    setBusy(true);
    setError(null);
    setRetryGuess(null);
    const attemptNumber = guesses.length + 1;
    setAnimatedGuessId(requestId);
    setPendingGuess({ requestId, model });

    try {
      const payload = await apiClient.submitClassicGuess(
        challenge.id,
        progress.playerId,
        requestId,
        model.id,
        attemptNumber,
      );
      if (payload.globalCompletionCount !== null) {
        setGlobalCompletionCount(payload.globalCompletionCount);
      }

      const entry: SavedGuess = {
        requestId,
        modelId: model.id,
        modelName: model.name,
        attemptedAt: new Date().toISOString(),
        attemptNumber,
        isCorrect: payload.guess.isCorrect,
        sameGuessCount: payload.guess.sameGuessCount,
        trajectoryAccessToken: payload.trajectoryAccessToken ?? undefined,
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

        return {
          ...nextState,
          preferences:
            entry.isCorrect && category === "hardcore"
              ? { ...nextState.preferences, innerCircleActive: false }
              : nextState.preferences,
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
      setRetryGuess({ requestId, model });
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const closeCompletion = () => {
    setShowCompletion(false);
    if (canEnterInnerCircle) setShowRitualGate(true);
  };

  if (category === "hardcore" && !hasHardcoreAccess) {
    return (
      <main className="page game-page game-page--locked">
        <SiteNavbar />
        <section className="hardcore-lock" aria-labelledby="hardcore-lock-title">
          <p className="eyebrow">Sealed</p>
          <h1 id="hardcore-lock-title">Nothing answers.</h1>
          <p>
            {user
              ? "Complete the Inner Circle ritual to enter."
              : "Sign in to enter the Inner Circle."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={`page game-page${category === "hardcore" ? " game-page--hardcore" : ""}`}>
      {category === "hardcore" && <HardcoreAtmosphere />}
      <SiteNavbar hardcore={category === "hardcore"} />

      <ClassicGameControls
        category={category}
        date={challenge?.date ?? null}
        expiresAt={challenge?.expiresAt ?? null}
        models={models}
        difficulty={selectedDifficulty}
        loading={isLoadingGame}
        busy={busy}
        canGuess={game?.status !== "solved"}
        completedCount={globalCompletionCount}
        guessed={guessed}
        onDifficultyChange={selectDifficulty}
        onPick={pick}
      />
      {category === "hardcore" && <HardcoreSoundtrack />}
      {!challenge && isLoadingGame && <p className="notice">Loading today’s game…</p>}
      {!challenge && error !== null && isApiUnavailable(error) && (
        <ApiUnavailableState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
      )}
      {!challenge && error !== null && !isApiUnavailable(error) && (
        <section className="notice" role="alert">
          <p>
            {error instanceof ApiError && error.status === 404
              ? "Today’s game is not available yet."
              : error instanceof Error
                ? error.message
                : "Could not load today’s game."}
          </p>
          <button className="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} type="button">
            Try again
          </button>
        </section>
      )}
      {challenge && error !== null && isApiUnavailable(error) && retryGuess && (
        <ApiUnavailableState
          onRetry={() => void pick(retryGuess.model, retryGuess.requestId)}
        />
      )}
      {challenge && error !== null && (!isApiUnavailable(error) || !retryGuess) && (
        <div className="notice" role="alert">
          <p>{error instanceof Error ? error.message : "Your guess could not be submitted."}</p>
          {retryGuess && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void pick(retryGuess.model, retryGuess.requestId)}
              type="button"
            >
              Retry guess
            </button>
          )}
        </div>
      )}

      {challenge && (
        <GuessBoard
          category={category}
          difficulty={selectedDifficulty}
          columns={columns}
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
      {game?.status === "solved" && (
        <div className="game-completion-action">
          <button className="button" onClick={() => setShowCompletion(true)} type="button">
            Show winning guess
          </button>
        </div>
      )}

      <button
        aria-label="How to play"
        className="game-help__button game-help__button--floating"
        onClick={() => setShowHowToPlay(true)}
      >
        <FaCircleQuestion aria-hidden focusable="false" />
      </button>

      <HowToPlayDialog category={category} open={showHowToPlay} onClose={closeHowToPlay} />
      {showRitualGate && <RitualGateDialog />}
      {challenge && game?.status === "solved" && showCompletion && (
        <Suspense fallback={null}>
          <GameCompletedDialog
            date={challenge.date}
            challengeId={challenge.id}
            category={category}
            difficulty={loadedDifficulty}
            guesses={guesses}
            ritualNotice={
              showCategoryRitualNotice
                ? `${categoryRitualNotices[category as Exclude<ClassicCategory, "hardcore">]} The ledger recorded ${solvedChallengeCount}/${focusedClassicCategories.length} seals today. Check your profile.`
                : undefined
            }
            onClose={closeCompletion}
            stats={{
              currentStreak: progress.stats.classic.currentStreak,
              bestStreak: progress.stats.classic.bestStreak,
              gamesPlayed: progress.stats.classic.gamesPlayed,
            }}
          />
        </Suspense>
      )}
    </main>
  );
}
