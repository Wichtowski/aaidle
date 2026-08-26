import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { FaCircleQuestion, FaGripVertical, FaLock } from "react-icons/fa6";
import { ApiError, apiClient, isApiUnavailable } from "@lib/api/client";
import {
  adjacentMovablePosition,
  initialTimelinePositions,
  moveTimelineModel,
  restoreTimelinePositions,
  timelineArrangementIsComplete,
} from "@lib/domain/games/timeline/timeline-arrangement";
import {
  readSavedTimelineGame,
  saveTimelineGame,
} from "@lib/domain/games/timeline/timeline-progress-store";
import {
  timelineDifficulties,
  timelineDifficultyLabel,
  type TimelineDifficulty,
  type TimelineGamePayload,
} from "@lib/domain/games/timeline/timeline-types";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { utcDate } from "@lib/utils/dates";
import { useAuth } from "../auth/useAuth";
import { ApiUnavailableState } from "../ui/ApiUnavailableState";
import { GameLoadingState } from "../ui/GameLoadingState";
import { SiteNavbar } from "../ui/SiteNavbar";
import { Toast } from "../ui/Toast";
import { GameEyebrow } from "./GameEyebrow";
import { GameIntro } from "./GameLayout";
import { TimelineHTP } from "./TimelineHTP";

const TimelineCompletedDialog = lazy(() =>
  import("./TimelineCompletedDialog").then(({ TimelineCompletedDialog }) => ({
    default: TimelineCompletedDialog,
  })),
);

function formatReleaseDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function hydrateGame(game: TimelineGamePayload) {
  const serverAttempt = game.progress.latestAttempt;
  const serverPositions = serverAttempt
    ? restoreTimelinePositions(game, serverAttempt.modelOrder)
    : null;
  const saved = readSavedTimelineGame(game.challenge.id);
  const savedPositions = saved ? restoreTimelinePositions(game, saved.positions) : null;
  const useSaved =
    !game.progress.solved &&
    savedPositions !== null &&
    saved !== null &&
    saved.acceptedAttempts >= (serverAttempt?.attemptNumber ?? 0);

  return {
    positions: useSaved ? savedPositions : (serverPositions ?? initialTimelinePositions(game)),
    placements: useSaved ? saved.placements : (serverAttempt?.placements ?? null),
    acceptedAttempts: Math.max(saved?.acceptedAttempts ?? 0, serverAttempt?.attemptNumber ?? 0),
    attemptsRemaining: game.progress.attemptsRemaining,
    solved: game.progress.solved || Boolean(useSaved && saved.solved),
  };
}

export function TimelineGame() {
  const progress = useLocalProgress();
  const { hardcoreUnlocked } = useAuth();
  const [difficulty, setDifficulty] = useState<TimelineDifficulty>("normal");
  const [game, setGame] = useState<TimelineGamePayload | null>(null);
  const [positions, setPositions] = useState<Array<string | null>>([]);
  const [placements, setPlacements] = useState<Array<0 | 1> | null>(null);
  const [acceptedAttempts, setAcceptedAttempts] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [draggingModelId, setDraggingModelId] = useState<string | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [validationSequence, setValidationSequence] = useState(0);
  const pendingRequestId = useRef<string | null>(null);
  const completionTimer = useRef<number | null>(null);
  const lastPointerTarget = useRef<string | null>(null);

  useEffect(() => {
    if (difficulty === "hardcore" && !hardcoreUnlocked) {
      setDifficulty("normal");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setGame(null);
    void apiClient
      .timelineGame(difficulty, progress.playerId, controller.signal)
      .then((nextGame) => {
        if (controller.signal.aborted) return;
        const hydrated = hydrateGame(nextGame);
        setGame(nextGame);
        setPositions(hydrated.positions);
        setPlacements(hydrated.placements);
        setAcceptedAttempts(hydrated.acceptedAttempts);
        setAttemptsRemaining(hydrated.attemptsRemaining);
        setSolved(hydrated.solved);
        setSelectedModelId(null);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [difficulty, hardcoreUnlocked, loadAttempt, progress.playerId]);

  useEffect(() => {
    if (!game || positions.length !== game.slots.length) return;
    saveTimelineGame({
      challengeId: game.challenge.id,
      challengeDate: game.challenge.date,
      difficulty: game.challenge.difficulty,
      positions,
      placements,
      acceptedAttempts,
      attemptsRemaining,
      solved,
      updatedAt: new Date().toISOString(),
    });
  }, [acceptedAttempts, attemptsRemaining, game, placements, positions, solved]);

  useEffect(
    () => () => {
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    },
    [],
  );

  const anchorPositions = useMemo(
    () => new Set(game?.slots.filter((slot) => slot.anchor).map((slot) => slot.position) ?? []),
    [game],
  );
  const itemById = useMemo(
    () =>
      new Map(
        game
          ? [
              ...game.movableModels,
              ...game.slots.flatMap((slot) => (slot.anchor ? [slot.anchor] : [])),
            ].map((item) => [item.id, item] as const)
          : [],
      ),
    [game],
  );
  const expectedModelIds = useMemo(() => new Set(itemById.keys()), [itemById]);
  const arrangedModelIds = useMemo(
    () => new Set(positions.filter((modelId): modelId is string => modelId !== null)),
    [positions],
  );
  const complete = timelineArrangementIsComplete(positions, expectedModelIds);
  const exhausted = attemptsRemaining === 0 && !solved;

  const moveModel = useCallback(
    (modelId: string, targetPosition: number | null) => {
      if (solved) return;
      setPositions((current) => {
        const next = moveTimelineModel(current, anchorPositions, modelId, targetPosition);
        if (next === current) return current;
        setPlacements(null);
        setSelectedModelId(null);
        pendingRequestId.current = null;
        return next;
      });
    },
    [anchorPositions, solved],
  );

  useEffect(() => {
    if (!draggingModelId) return;
    const pointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch") event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const slot = target?.closest<HTMLElement>("[data-timeline-position]");
      const tray = target?.closest<HTMLElement>("[data-timeline-tray]");
      const targetKey = slot?.dataset.timelinePosition ?? (tray ? "tray" : null);
      if (targetKey === null || targetKey === lastPointerTarget.current) return;
      lastPointerTarget.current = targetKey;
      moveModel(draggingModelId, targetKey === "tray" ? null : Number(targetKey));
    };
    const pointerUp = () => {
      setDraggingModelId(null);
      lastPointerTarget.current = null;
    };
    window.addEventListener("pointermove", pointerMove, { passive: false });
    window.addEventListener("pointerup", pointerUp, { once: true });
    window.addEventListener("pointercancel", pointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
    };
  }, [draggingModelId, moveModel]);

  const dragStart = (event: DragEvent, modelId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", modelId);
    setDraggingModelId(modelId);
  };
  const dropAt = (event: DragEvent, position: number | null) => {
    event.preventDefault();
    const modelId = event.dataTransfer.getData("text/plain") || draggingModelId;
    if (modelId) moveModel(modelId, position);
    setDraggingModelId(null);
  };
  const startPointerDrag = (event: PointerEvent, modelId: string) => {
    if (event.pointerType === "touch") event.preventDefault();
    setDraggingModelId(modelId);
    lastPointerTarget.current = null;
  };
  const cardKeyDown = (event: KeyboardEvent, modelId: string, position: number) => {
    const direction = ["ArrowLeft", "ArrowUp"].includes(event.key)
      ? -1
      : ["ArrowRight", "ArrowDown"].includes(event.key)
        ? 1
        : null;
    if (direction === null) return;
    event.preventDefault();
    moveModel(
      modelId,
      adjacentMovablePosition(position, direction, positions.length, anchorPositions),
    );
  };

  const submit = async () => {
    if (!game || !complete || busy || solved || exhausted) return;
    const requestId = pendingRequestId.current ?? crypto.randomUUID();
    pendingRequestId.current = requestId;
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.submitTimelineAttempt(
        game.challenge.id,
        progress.playerId,
        requestId,
        positions as string[],
      );
      pendingRequestId.current = null;
      const didSolve = result.placements.every((placement) => placement === 1);
      setPlacements(result.placements);
      setAttemptsRemaining(result.attemptsRemaining);
      setAcceptedAttempts((current) => current + 1);
      setSolved(didSolve);
      setValidationSequence((sequence) => sequence + 1);
      if (didSolve) {
        void apiClient
          .timelineGame(game.challenge.difficulty, progress.playerId)
          .then((revealedGame) => setGame(revealedGame))
          .catch(() => {
            setToast("Timeline solved. Reload the page to reveal every date.");
          });
        completionTimer.current = window.setTimeout(() => setShowCompletion(true), 1_200);
      }
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.code === "ATTEMPT_LIMIT_REACHED") {
        setAttemptsRemaining(0);
      }
      setToast(
        submitError instanceof Error
          ? submitError.message
          : "We could not submit this Timeline arrangement.",
      );
    } finally {
      setBusy(false);
    }
  };

  const difficultyControls = (
    <div className="game-intro__difficulty">
      <span>Difficulty</span>
      <div className="difficulty-switch" data-testid="timeline-difficulty">
        {timelineDifficulties
          .filter((option) => option !== "hardcore" || hardcoreUnlocked)
          .map((option) => (
            <button
              aria-pressed={difficulty === option}
              disabled={busy || loading}
              key={option}
              onClick={() => setDifficulty(option)}
              type="button"
            >
              {timelineDifficultyLabel(option)}
            </button>
          ))}
      </div>
    </div>
  );

  return (
    <main className="page game-page timeline-page">
      <SiteNavbar />
      <GameIntro
        description="Place events in chronological order. Dates stay hidden until every position is correct."
        difficulty={difficultyControls}
        expiresAt={game?.challenge.expiresAt ?? null}
        eyebrow={
          <GameEyebrow
            date={game?.challenge.date ?? utcDate()}
            game="Timeline"
            variant={timelineDifficultyLabel(difficulty)}
          />
        }
        onExpiry={() => setLoadAttempt((attempt) => attempt + 1)}
        title={
          <>
            Build today’s <em>timeline.</em>
          </>
        }
        titleId="timeline-title"
      />

      {loading && <GameLoadingState label="Loading today’s Timeline…" />}
      {!loading &&
        Boolean(error) &&
        !game &&
        (isApiUnavailable(error) ? (
          <ApiUnavailableState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
        ) : (
          <section className="api-unavailable" role="alert">
            <h2>Timeline unavailable</h2>
            <p>{error instanceof Error ? error.message : "Please try again."}</p>
          </section>
        ))}

      {game && (
        <section className="timeline-game" aria-label="Timeline arrangement">
          <div className="timeline-game__status" aria-live="polite">
            <p>
              <strong>{arrangedModelIds.size}</strong> / {positions.length} positions filled
            </p>
            {attemptsRemaining !== null && (
              <p>
                <strong>{attemptsRemaining}</strong> of {game.progress.attemptLimit} submissions
                remaining
              </p>
            )}
          </div>

          <ol className="timeline-board" key={validationSequence}>
            {game.slots.map((slot, position) => {
              const modelId = positions[position];
              const item = modelId ? itemById.get(modelId) : null;
              const placement = placements?.[position];
              const feedback = placement === 1 ? "correct" : placement === 0 ? "incorrect" : null;
              return (
                <li
                  className={`timeline-slot${slot.anchor ? " timeline-slot--anchor" : ""}`}
                  data-timeline-position={position}
                  key={slot.position}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropAt(event, position)}
                  style={{ "--timeline-index": position } as CSSProperties}
                >
                  <span className="timeline-slot__marker">
                    {String(position + 1).padStart(2, "0")}
                  </span>
                  {slot.anchor ? (
                    <article className="timeline-card timeline-card--anchor">
                      <span className="timeline-card__meta">
                        <FaLock aria-hidden /> Locked {slot.anchor.itemKind}
                      </span>
                      <strong>{slot.anchor.name}</strong>
                      <time dateTime={slot.anchor.releaseDate}>
                        {formatReleaseDate(slot.anchor.releaseDate)}
                      </time>
                    </article>
                  ) : item ? (
                    <button
                      aria-label={`Position ${position + 1}: ${item.name}${feedback ? `, ${feedback}` : ""}`}
                      aria-pressed={selectedModelId === item.id}
                      className={`timeline-card timeline-card--movable${feedback ? ` timeline-card--${feedback}` : ""}`}
                      draggable={!solved}
                      onClick={() => {
                        if (selectedModelId && selectedModelId !== item.id) {
                          moveModel(selectedModelId, position);
                        } else {
                          setSelectedModelId(selectedModelId === item.id ? null : item.id);
                        }
                      }}
                      onDragStart={(event) => dragStart(event, item.id)}
                      onKeyDown={(event) => cardKeyDown(event, item.id, position)}
                      onPointerDown={(event) => startPointerDrag(event, item.id)}
                      type="button"
                    >
                      <span className="timeline-card__meta">
                        <FaGripVertical aria-hidden /> {item.itemKind}
                      </span>
                      <strong>{item.name}</strong>
                      {solved && item.releaseDate && (
                        <time dateTime={item.releaseDate}>
                          {formatReleaseDate(item.releaseDate)}
                        </time>
                      )}
                      {feedback && (
                        <span className="timeline-card__feedback">
                          {feedback === "correct" ? "✓ Correct position" : "× Incorrect position"}
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      aria-label={`Empty timeline position ${position + 1}${selectedModelId ? ", place selected card" : ""}`}
                      className="timeline-slot__empty"
                      onClick={() => {
                        if (selectedModelId) moveModel(selectedModelId, position);
                      }}
                      type="button"
                    >
                      <span>Drop here</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>

          <section
            aria-labelledby="timeline-tray-title"
            className="timeline-tray"
            data-timeline-tray
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => dropAt(event, null)}
          >
            <div>
              <p className="eyebrow">Movable cards</p>
              <h2 id="timeline-tray-title">Place these without seeing their dates</h2>
            </div>
            <div className="timeline-tray__cards">
              {game.movableModels
                .filter((item) => !arrangedModelIds.has(item.id))
                .map((item) => (
                  <button
                    aria-pressed={selectedModelId === item.id}
                    className="timeline-card timeline-card--movable"
                    draggable={!solved}
                    key={item.id}
                    onClick={() => setSelectedModelId(selectedModelId === item.id ? null : item.id)}
                    onDragStart={(event) => dragStart(event, item.id)}
                    onPointerDown={(event) => startPointerDrag(event, item.id)}
                    type="button"
                  >
                    <span className="timeline-card__meta">
                      <FaGripVertical aria-hidden /> {item.itemKind}
                    </span>
                    <strong>{item.name}</strong>
                  </button>
                ))}
              {game.movableModels.every((item) => arrangedModelIds.has(item.id)) && (
                <p className="timeline-tray__empty">Every card is on the timeline.</p>
              )}
            </div>
          </section>

          <div className="timeline-submit">
            <button
              className="button button--primary"
              disabled={!complete || busy || solved || exhausted}
              onClick={() => void submit()}
              type="button"
            >
              {busy
                ? "Checking arrangement…"
                : solved
                  ? "Timeline solved"
                  : exhausted
                    ? "No submissions remaining"
                    : "Submit complete timeline"}
            </button>
            {!complete && <p>Fill every position exactly once to submit.</p>}
            {exhausted && (
              <p>Your final arrangement remains private. The answer is not revealed.</p>
            )}
          </div>
          {solved && !showCompletion && (
            <div className="game-completion-action">
              <button className="button" onClick={() => setShowCompletion(true)} type="button">
                Show winning timeline
              </button>
            </div>
          )}
        </section>
      )}

      <button
        aria-haspopup="dialog"
        aria-label="Timeline rules"
        className="game-help__button game-help__button--floating"
        onClick={() => setShowHowToPlay(true)}
        type="button"
      >
        <FaCircleQuestion aria-hidden />
        <span>How to play</span>
      </button>
      <TimelineHTP open={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
      {game && solved && showCompletion && (
        <Suspense fallback={null}>
          <TimelineCompletedDialog
            anchorPositions={anchorPositions}
            attempts={acceptedAttempts}
            date={game.challenge.date}
            difficulty={game.challenge.difficulty}
            onClose={() => setShowCompletion(false)}
            totalPositions={game.slots.length}
          />
        </Suspense>
      )}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
