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
import { Link } from "react-router-dom";
import {
  FaCheck,
  FaCircleQuestion,
  FaEquals,
  FaGripVertical,
  FaLock,
  FaXmark,
} from "react-icons/fa6";
import { ApiError, apiClient } from "@lib/api/client";
import {
  adjacentMovablePosition,
  moveTimelineModel,
  TIMELINE_DESKTOP_COLUMNS,
  timelineArrangementIsComplete,
  timelineVisualPosition,
} from "@lib/domain/games/timeline/timeline-arrangement";
import {
  timelineDifficulties,
  timelineDifficultyLabel,
} from "@lib/domain/games/timeline/timeline-types";
import { timelineCategoryLabel } from "@lib/domain/games/timeline/timeline-category";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { utcDate } from "@lib/utils/dates";
import { useAuth } from "../../auth/useAuth";
import { ApiUnavailableState } from "../../ui/ApiUnavailableState";
import { GameLoadingState } from "../../ui/GameLoadingState";
import { SiteNavbar } from "../../ui/SiteNavbar";
import { Toast } from "../../ui/Toast";
import { GameEyebrow } from "../common/layout/GameEyebrow";
import { GameIntro } from "../common/layout/GameLayout";
import { DifficultySwitch } from "../common/layout/DifficultySwitch";
import { TimelineHTP } from "./TimelineHTP";
import { SpeedrunGiveUpDialog } from "./SpeedrunGiveUpDialog";
import { SpeedrunUsernameDialog } from "./SpeedrunUsernameDialog";
import { HowToPlayDialog } from "../common/dialogs/HowToPlayDialog";
import { useTimelineGame } from "./use-timeline-game";

const TimelineCompletedDialog = lazy(() =>
  import("./TimelineCompletedDialog").then(({ TimelineCompletedDialog }) => ({
    default: TimelineCompletedDialog,
  })),
);

const timelineCardAnimationDuration = 560;
const timelineCardAnimationStagger = 70;
const timelineWinningAnimationDuration = 900;
const timelineWinningAnimationStagger = 90;
const timelineFeedbackIconSize = 16;
const speedrunSubmissionCooldownSeconds = 5;

function formatReleaseDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return year ?? value;

  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return year;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function YearAnnotationTrigger({
  item,
  onOpen,
}: {
  item: { name: string; releaseDate?: string; yearAnnotation?: string };
  onOpen: () => void;
}) {
  if (!item.releaseDate || !item.yearAnnotation) {
    if (!item.releaseDate) return null;
    return (
      <time className="timeline-card__date" dateTime={item.releaseDate}>
        {formatReleaseDate(item.releaseDate)}
      </time>
    );
  }

  const activate = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <span
      aria-label={`Show year note for ${item.name}`}
      className="timeline-card__date timeline-card__date-help"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={activate}
      role="button"
      tabIndex={0}
    >
      <time dateTime={item.releaseDate}>{formatReleaseDate(item.releaseDate)}</time>
      <FaCircleQuestion aria-hidden />
    </span>
  );
}

export function TimelineGame() {
  const progress = useLocalProgress();
  const { hardcoreUnlocked, setAuthenticatedUser, user } = useAuth();
  const {
    acceptedAttempts,
    attemptsRemaining,
    difficulty,
    error,
    game,
    gameCache,
    loading,
    placements,
    positions,
    selectDifficulty,
    selectedModelId,
    setAcceptedAttempts,
    setAttemptsRemaining,
    setError,
    setGame,
    setLoadAttempt,
    setPlacements,
    setPositions,
    setSelectedModelId,
    setSolved,
    setSpeedrunElapsed,
    setSpeedrunGivenUpAt,
    setSpeedrunStartedAt,
    solved,
    speedrunElapsed,
    speedrunGivenUpAt,
    speedrunStartedAt,
  } = useTimelineGame({
    canSpeedrun: Boolean(user),
    hardcoreUnlocked,
    playerId: progress.playerId,
  });
  const [busy, setBusy] = useState(false);
  const [draggingModelId, setDraggingModelId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<number | "tray" | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showSpeedrunGiveUp, setShowSpeedrunGiveUp] = useState(false);
  const [showSpeedrunUsername, setShowSpeedrunUsername] = useState(false);
  const speedrunUsernameHandled = useRef(false);
  const [yearAnnotation, setYearAnnotation] = useState<{
    name: string;
    releaseDate: string;
    annotation: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [landingModelId, setLandingModelId] = useState<string | null>(null);
  const [landedModelIds, setLandedModelIds] = useState<Set<string>>(() => new Set());
  const [submissionCooldownRemaining, setSubmissionCooldownRemaining] = useState(0);
  const pendingRequestId = useRef<string | null>(null);
  const completionTimer = useRef<number | null>(null);
  const landingTimer = useRef<number | null>(null);
  const draggingModelIdRef = useRef<string | null>(null);
  const lastPointerTarget = useRef<string | null>(null);
  const pointerY = useRef<number | null>(null);
  const pointerDragActive = useRef(false);
  const autoScrollFrame = useRef<number | null>(null);
  const speedrunStartPromise = useRef<Promise<number | null> | null>(null);

  useEffect(() => {
    if (difficulty !== "speedrun") {
      setFocusMode(false);
      setShowSpeedrunGiveUp(false);
      setShowSpeedrunUsername(false);
      speedrunUsernameHandled.current = false;
    }
  }, [difficulty]);

  useEffect(() => {
    if (difficulty === "speedrun" && solved && user && !user.username) {
      setShowSpeedrunUsername(true);
    }
  }, [difficulty, solved, user]);

  useEffect(
    () => () => {
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
      if (landingTimer.current !== null) window.clearTimeout(landingTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (submissionCooldownRemaining <= 0) return;
    const timer = window.setTimeout(
      () => setSubmissionCooldownRemaining((remaining) => Math.max(0, remaining - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [submissionCooldownRemaining]);

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
  const speedrunCovered = difficulty === "speedrun" && speedrunStartedAt === null;
  const speedrunUnfinished = difficulty === "speedrun" && speedrunGivenUpAt !== null;
  const arrangedModelIds = useMemo(
    () => new Set(positions.filter((modelId): modelId is string => modelId !== null)),
    [positions],
  );
  const complete = timelineArrangementIsComplete(positions, expectedModelIds);
  const exhausted = attemptsRemaining === 0 && !solved;

  const submissionCoolingDown = difficulty === "speedrun" && submissionCooldownRemaining > 0;
  const startSpeedrun = useCallback(() => {
    if (
      difficulty !== "speedrun" ||
      !game ||
      speedrunStartedAt !== null ||
      speedrunGivenUpAt !== null
    ) {
      return Promise.resolve(speedrunStartedAt);
    }
    if (speedrunStartPromise.current) return speedrunStartPromise.current;
    const promise = apiClient
      .startTimelineSpeedrun(game.challenge.id, progress.playerId)
      .then(({ startedAt, movableModels }) => {
        const cachedGame = gameCache.current[difficulty];
        if (cachedGame) {
          gameCache.current[difficulty] = {
            ...cachedGame,
            movableModels,
            progress: { ...cachedGame.progress, speedrunStartedAt: startedAt },
          };
        }
        setGame((current) =>
          current
            ? {
                ...current,
                movableModels,
                progress: { ...current.progress, speedrunStartedAt: startedAt },
              }
            : current,
        );
        setSpeedrunStartedAt((current) => current ?? startedAt);
        return startedAt;
      })
      .catch((startError: unknown) => {
        speedrunStartPromise.current = null;
        throw startError;
      });
    speedrunStartPromise.current = promise;
    return promise;
  }, [difficulty, game, progress.playerId, speedrunGivenUpAt, speedrunStartedAt]);

  const giveUpSpeedrun = async () => {
    if (!game || !speedrunStartedAt || speedrunGivenUpAt || busy) return;
    setBusy(true);
    try {
      const { givenUpAt } = await apiClient.giveUpTimelineSpeedrun(
        game.challenge.id,
        progress.playerId,
      );
      setSpeedrunGivenUpAt(givenUpAt);
      setSpeedrunElapsed(Math.max(0, givenUpAt - speedrunStartedAt));
      setSelectedModelId(null);
      const unfinishedGame = {
        ...game,
        progress: { ...game.progress, speedrunGivenUpAt: givenUpAt },
      };
      gameCache.current[difficulty] = unfinishedGame;
      setGame(unfinishedGame);
      setShowSpeedrunGiveUp(false);
    } catch (giveUpError) {
      setToast(
        giveUpError instanceof Error
          ? giveUpError.message
          : "We could not mark this Speedrun unfinished.",
      );
    } finally {
      setBusy(false);
    }
  };

  const triggerLanding = useCallback((modelId: string) => {
    if (landingTimer.current !== null) window.clearTimeout(landingTimer.current);
    setLandedModelIds((current) => new Set(current).add(modelId));
    setLandingModelId(modelId);
    landingTimer.current = window.setTimeout(() => {
      setLandingModelId(null);
      landingTimer.current = null;
    }, 560);
  }, []);

  const chooseSpeedrunUsername = async (username: string | null) => {
    try {
      if (username) {
        const result = await apiClient.updateUsername(username);
        setAuthenticatedUser(result.user);
      }
      speedrunUsernameHandled.current = true;
      setShowSpeedrunUsername(false);
    } catch (usernameError) {
      setToast(
        usernameError instanceof Error ? usernameError.message : "Could not save your username.",
      );
    }
  };

  const moveModel = useCallback(
    (modelId: string, targetPosition: number | null) => {
      if (solved || speedrunUnfinished) return;
      setPositions((current) => {
        const sourcePosition = current.indexOf(modelId);
        if (
          (sourcePosition >= 0 && placements?.[sourcePosition] === 1) ||
          (targetPosition !== null && placements?.[targetPosition] === 1)
        ) {
          return current;
        }
        const next = moveTimelineModel(current, anchorPositions, modelId, targetPosition);
        if (next === current) return current;
        setPlacements((currentPlacements) => {
          if (!currentPlacements) return null;
          return currentPlacements.map((placement, position) =>
            position === sourcePosition || position === targetPosition ? null : placement,
          );
        });
        setSelectedModelId(null);
        pendingRequestId.current = null;
        return next;
      });
    },
    [anchorPositions, placements, solved, speedrunUnfinished],
  );

  useEffect(() => {
    if (!draggingModelId || !pointerDragActive.current) return;
    const maxScrollStep = 150;
    const autoScroll = () => {
      const y = pointerY.current;
      const scrollEdge = window.innerHeight * 0.2;
      if (y !== null) {
        const scrollStep =
          y < scrollEdge
            ? -Math.ceil(((scrollEdge - y) / scrollEdge) * maxScrollStep)
            : y > window.innerHeight - scrollEdge
              ? Math.ceil(((y - (window.innerHeight - scrollEdge)) / scrollEdge) * maxScrollStep)
              : 0;
        if (scrollStep !== 0) window.scrollBy(0, scrollStep);
      }
      autoScrollFrame.current = window.requestAnimationFrame(autoScroll);
    };
    autoScrollFrame.current = window.requestAnimationFrame(autoScroll);

    const resolveTarget = (clientX: number, clientY: number) => {
      const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const slot = target?.closest<HTMLElement>("[data-timeline-position]");
      const tray = target?.closest<HTMLElement>("[data-timeline-tray]");
      return slot?.dataset.timelinePosition ?? (tray ? "tray" : null);
    };
    const pointerMove = (event: globalThis.PointerEvent) => {
      event.preventDefault();
      pointerY.current = event.clientY;
      const targetKey = resolveTarget(event.clientX, event.clientY);
      setDragOverTarget(
        targetKey === "tray" ? "tray" : targetKey === null ? null : Number(targetKey),
      );
      lastPointerTarget.current = targetKey;
    };
    const pointerUp = (event: globalThis.PointerEvent) => {
      const modelId = draggingModelIdRef.current ?? draggingModelId;
      const targetKey = resolveTarget(event.clientX, event.clientY);
      if (modelId && targetKey !== null) {
        moveModel(modelId, targetKey === "tray" ? null : Number(targetKey));
        triggerLanding(modelId);
      }
      pointerDragActive.current = false;
      draggingModelIdRef.current = null;
      setDraggingModelId(null);
      setDragOverTarget(null);
      lastPointerTarget.current = null;
      pointerY.current = null;
    };
    const pointerCancel = () => {
      pointerDragActive.current = false;
      draggingModelIdRef.current = null;
      setDraggingModelId(null);
      setDragOverTarget(null);
      lastPointerTarget.current = null;
      pointerY.current = null;
    };
    window.addEventListener("pointermove", pointerMove, { passive: false });
    window.addEventListener("pointerup", pointerUp, { once: true });
    window.addEventListener("pointercancel", pointerCancel, { once: true });
    return () => {
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerCancel);
      pointerY.current = null;
      if (autoScrollFrame.current !== null) {
        window.cancelAnimationFrame(autoScrollFrame.current);
        autoScrollFrame.current = null;
      }
    };
  }, [draggingModelId, moveModel, triggerLanding]);

  const dragStart = (event: DragEvent, modelId: string) => {
    if (pointerDragActive.current) {
      event.preventDefault();
      return;
    }
    const position = positions.indexOf(modelId);
    if (position >= 0 && placements?.[position] === 1) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", modelId);
    const source = event.currentTarget;
    const preview = source.cloneNode(true) as HTMLElement;
    const sourceRect = source.getBoundingClientRect();
    preview.classList.remove("timeline-card--dragging");
    preview.style.width = `${sourceRect.width}px`;
    preview.style.height = `${sourceRect.height}px`;
    preview.style.animation = "none";
    preview.style.position = "fixed";
    preview.style.top = "-10000px";
    preview.style.left = "-10000px";
    preview.style.opacity = "1";
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 20, 20);
    window.setTimeout(() => preview.remove(), 0);
    pointerDragActive.current = false;
    draggingModelIdRef.current = modelId;
    setDraggingModelId(modelId);
  };
  const dragEnd = () => {
    draggingModelIdRef.current = null;
    setDraggingModelId(null);
    setDragOverTarget(null);
  };
  const dropAt = (event: DragEvent, position: number | null) => {
    event.preventDefault();
    const modelId =
      event.dataTransfer.getData("text/plain") || draggingModelIdRef.current || draggingModelId;
    if (modelId) {
      moveModel(modelId, position);
      triggerLanding(modelId);
    }
    draggingModelIdRef.current = null;
    setDraggingModelId(null);
    setDragOverTarget(null);
  };
  const startPointerDrag = (event: PointerEvent, modelId: string) => {
    if (event.pointerType !== "touch") return;
    const position = positions.indexOf(modelId);
    if (position >= 0 && placements?.[position] === 1) return;
    if (event.pointerType === "touch") event.preventDefault();
    pointerDragActive.current = true;
    draggingModelIdRef.current = modelId;
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
    if (
      !game ||
      !complete ||
      busy ||
      solved ||
      speedrunUnfinished ||
      exhausted ||
      submissionCoolingDown
    ) {
      return;
    }
    if (difficulty === "speedrun") await startSpeedrun();
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
      const revealedModels = new Map(
        (result.revealedModels ?? []).map((model) => [model.id, model]),
      );
      const revealedGame = {
        ...game,
        movableModels: game.movableModels.map((model) =>
          revealedModels.get(model.id) ? { ...model, ...revealedModels.get(model.id) } : model,
        ),
      };
      setPlacements(result.placements);
      setAttemptsRemaining(result.attemptsRemaining);
      setAcceptedAttempts((current) => current + 1);
      setSolved(didSolve);
      if (didSolve && result.speedrunTimeMs !== undefined) {
        setSpeedrunElapsed(result.speedrunTimeMs);
      }
      gameCache.current[difficulty] = {
        ...revealedGame,
        progress: {
          ...game.progress,
          solved: didSolve,
          attemptsRemaining: result.attemptsRemaining,
          latestAttempt: {
            modelOrder: [...positions] as string[],
            placements: result.placements,
            attemptNumber: acceptedAttempts + 1,
          },
        },
      };
      setGame(revealedGame);
      if (!didSolve) {
        if (difficulty === "speedrun") {
          setSubmissionCooldownRemaining(speedrunSubmissionCooldownSeconds);
        }
      }
      if (didSolve) {
        void apiClient
          .timelineGame(game.challenge.difficulty, progress.playerId)
          .then((revealedGame) => {
            gameCache.current[difficulty] = revealedGame;
            setGame(revealedGame);
          })
          .catch(() => {
            setToast("Timeline solved. Reload the page to reveal every date.");
          });
        const animationDuration =
          timelineCardAnimationDuration +
          Math.max(0, game.slots.length - 1) * timelineCardAnimationStagger +
          100;
        completionTimer.current = window.setTimeout(
          () => setShowCompletion(true),
          Math.max(
            animationDuration,
            timelineWinningAnimationDuration +
              Math.max(0, game.slots.length - 1) * timelineWinningAnimationStagger +
              100,
          ),
        );
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

  const difficultySwitch = (
    <DifficultySwitch
      ariaLabel="Timeline difficulty"
      disabled={(option) => busy || loading || (option.value === "speedrun" && !user)}
      onChange={selectDifficulty}
      options={timelineDifficulties
        .filter((option) => option !== "hardcore" || hardcoreUnlocked)
        .map((option) => ({
          value: option,
          label: timelineDifficultyLabel(option),
          description: option === "speedrun" ? "Sign in to unlock Speedrun." : undefined,
        }))}
      selected={difficulty}
      testId="timeline-difficulty"
    />
  );
  const speedrunActions = (
    <div className="timeline-speedrun-controls__actions">
      <Link
        className="button"
        to={
          game
            ? `/timeline/leaderboard/${game.challenge.date.replaceAll("-", "")}`
            : "/timeline/leaderboard"
        }
      >
        Leaderboard
      </Link>
      <button
        aria-pressed={focusMode}
        className="button"
        onClick={() => setFocusMode((focused) => !focused)}
        type="button"
      >
        {focusMode ? "Exit focus" : "Focus mode"}
      </button>
    </div>
  );
  const difficultyControls =
    difficulty === "speedrun" ? (
      <div className="timeline-speedrun-controls">
        {difficultySwitch}
        {!focusMode && speedrunActions}
      </div>
    ) : (
      difficultySwitch
    );

  return (
    <main
      className={`page game-page timeline-page${focusMode && difficulty === "speedrun" ? " timeline-page--focus" : ""}`}
    >
      {!focusMode && <SiteNavbar />}
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
        onExpiry={() => {
          delete gameCache.current[difficulty];
          setLoadAttempt((attempt) => attempt + 1);
        }}
        reserveInputSlot={false}
        title={
          <>
            Build today’s <em>timeline.</em>
          </>
        }
        titleId="timeline-title"
      />

      {loading && !game && <GameLoadingState label="Loading today’s Timeline…" />}
      {!loading && Boolean(error) && !game && (
        <ApiUnavailableState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
      )}

      {game && (
        <section className="timeline-game" aria-label="Timeline arrangement">
          <div className="timeline-game__status">
            <p aria-live="polite">
              <strong>{arrangedModelIds.size}</strong> / {positions.length} positions filled
            </p>
            <div className="timeline-game__status-details">
              <div className="timeline-game__status-metrics" aria-live="polite">
                {difficulty === "speedrun" && (
                  <p>
                    {solved ? (
                      <>
                        Your today’s time: <strong>{(speedrunElapsed / 1000).toFixed(1)}s</strong>
                      </>
                    ) : speedrunUnfinished ? (
                      <strong>Unfinished</strong>
                    ) : (
                      <>
                        <strong>{(speedrunElapsed / 1000).toFixed(1)}s</strong> elapsed
                      </>
                    )}
                  </p>
                )}
                {difficulty === "speedrun" && !solved && speedrunStartedAt === null && (
                  <button
                    className="button button--primary timeline-game__speedrun-start"
                    onClick={() => {
                      void startSpeedrun().catch((startError: unknown) => {
                        setToast(
                          startError instanceof Error
                            ? startError.message
                            : "We could not start the Speedrun timer.",
                        );
                      });
                    }}
                    type="button"
                  >
                    Show cards and start
                  </button>
                )}
                {difficulty === "speedrun" &&
                  !solved &&
                  !speedrunUnfinished &&
                  speedrunStartedAt !== null && (
                    <button
                      className="button button--danger timeline-game__speedrun-give-up"
                      disabled={busy}
                      onClick={() => setShowSpeedrunGiveUp(true)}
                      type="button"
                    >
                      Give up
                    </button>
                  )}
                {attemptsRemaining !== null && (
                  <p>
                    <strong>{attemptsRemaining}</strong> of {game.progress.attemptLimit} submissions
                    remaining
                  </p>
                )}
              </div>
              {difficulty === "speedrun" && focusMode && speedrunActions}
            </div>
          </div>

          <ol
            className={[
              "timeline-board",
              difficulty !== "normal" ? "timeline-board--multirow" : "",
            ].join(" ")}
            onDragOver={(event) => event.preventDefault()}
          >
            {game.slots.map((slot, position) => {
              const modelId = positions[position];
              const item = modelId ? itemById.get(modelId) : null;
              const placement = placements?.[position];
              const feedback =
                placement === 1
                  ? "correct"
                  : placement === 2
                    ? difficulty === "speedrun"
                      ? "neighbour"
                      : "same-year"
                    : placement === 0
                      ? "incorrect"
                      : null;
              const showDate = solved || feedback === "correct";
              const isDragOrigin = draggingModelId === item?.id;
              const visualPosition = timelineVisualPosition(position, TIMELINE_DESKTOP_COLUMNS);
              const positionWithinRow = position % TIMELINE_DESKTOP_COLUMNS;
              const isRowEnd =
                positionWithinRow === TIMELINE_DESKTOP_COLUMNS - 1 ||
                position === game.slots.length - 1;
              return (
                <li
                  className={`timeline-slot${slot.anchor ? " timeline-slot--anchor" : ""}${dragOverTarget === position ? " timeline-slot--drop-target" : ""}${visualPosition && visualPosition.row % 2 === 0 ? " timeline-slot--row-reverse" : " timeline-slot--row-forward"}${isRowEnd ? " timeline-slot--row-end" : ""}${position === game.slots.length - 1 ? " timeline-slot--last" : ""}`}
                  data-timeline-position={position}
                  key={slot.position}
                  onDragEnter={() => setDragOverTarget(position)}
                  onDragLeave={(event) => {
                    const relatedTarget = event.relatedTarget as Node | null;
                    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
                      setDragOverTarget(null);
                    }
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropAt(event, position)}
                  style={
                    {
                      "--timeline-index": position,
                      gridColumn: visualPosition?.column,
                      gridRow: visualPosition?.row,
                    } as CSSProperties
                  }
                >
                  <span
                    className={`timeline-slot__marker${position + 1 >= 10 ? " timeline-slot__marker--double-digit" : ""}`}
                  >
                    {position + 1}
                  </span>
                  {slot.anchor ? (
                    <article
                      className={`timeline-card timeline-card--anchor${placements ? " timeline-card--submitted" : ""}${solved ? " timeline-card--winning" : ""}`}
                    >
                      <span className="timeline-card__meta">
                        <FaLock aria-hidden />{" "}
                        {timelineCategoryLabel(slot.anchor.categories, slot.anchor.itemKind)}
                      </span>
                      <strong>{slot.anchor.name}</strong>
                      <YearAnnotationTrigger
                        item={slot.anchor}
                        onOpen={() =>
                          slot.anchor?.yearAnnotation &&
                          setYearAnnotation({
                            name: slot.anchor.name,
                            releaseDate: slot.anchor.releaseDate,
                            annotation: slot.anchor.yearAnnotation,
                          })
                        }
                      />
                    </article>
                  ) : item ? (
                    <button
                      aria-label={`Position ${position + 1}: ${item.name}${feedback ? `, ${feedback}` : ""}`}
                      aria-pressed={selectedModelId === item.id}
                      className={`timeline-card timeline-card--movable${solved ? " timeline-card--solved timeline-card--winning" : ""}${placements ? " timeline-card--submitted" : ""}${speedrunCovered ? " timeline-card--covered" : ""}${isDragOrigin ? " timeline-card--dragging timeline-card--drag-origin" : ""}${landingModelId === item.id ? " timeline-card--landing" : ""}${landedModelIds.has(item.id) ? " timeline-card--landed" : ""}${feedback ? ` timeline-card--${feedback}` : ""}`}
                      disabled={
                        difficulty === "speedrun" &&
                        (speedrunStartedAt === null || speedrunUnfinished)
                      }
                      draggable={
                        !solved &&
                        !speedrunUnfinished &&
                        feedback !== "correct" &&
                        (difficulty !== "speedrun" || speedrunStartedAt !== null)
                      }
                      onClick={() => {
                        if (
                          difficulty === "speedrun" &&
                          (speedrunStartedAt === null || speedrunUnfinished)
                        ) {
                          return;
                        }
                        if (selectedModelId && selectedModelId !== item.id) {
                          moveModel(selectedModelId, position);
                        } else if (feedback !== "correct") {
                          setSelectedModelId(selectedModelId === item.id ? null : item.id);
                        }
                      }}
                      onDragStart={(event) => dragStart(event, item.id)}
                      onDragEnd={dragEnd}
                      onKeyDown={(event) => cardKeyDown(event, item.id, position)}
                      onPointerDown={(event) => startPointerDrag(event, item.id)}
                      type="button"
                    >
                      {speedrunCovered ? (
                        <span className="timeline-card__covered-label">Covered card</span>
                      ) : isDragOrigin ? (
                        <span>Drop here</span>
                      ) : (
                        <>
                          <span className="timeline-card__meta">
                            <FaGripVertical aria-hidden />{" "}
                            {timelineCategoryLabel(item.categories, item.itemKind)}
                          </span>
                          <strong>{item.name}</strong>
                          {(feedback || (showDate && item.releaseDate)) && (
                            <span className="timeline-card__result">
                              {feedback && (
                                <span className="timeline-card__feedback">
                                  {feedback === "correct" ? (
                                    <>
                                      <FaCheck aria-hidden="true" size={timelineFeedbackIconSize} />{" "}
                                      Correct position
                                    </>
                                  ) : feedback === "same-year" ? (
                                    <>
                                      <FaEquals aria-hidden="true" size={timelineFeedbackIconSize} />{" "}
                                      Same year
                                    </>
                                  ) : (
                                    <>
                                      <FaXmark aria-hidden="true" size={timelineFeedbackIconSize} />{" "}
                                      Incorrect position
                                    </>
                                  )}
                                </span>
                              )}
                              {showDate && item.releaseDate && (
                                <YearAnnotationTrigger
                                  item={item}
                                  onOpen={() =>
                                    item.yearAnnotation &&
                                    setYearAnnotation({
                                      name: item.name,
                                      releaseDate: item.releaseDate!,
                                      annotation: item.yearAnnotation,
                                    })
                                  }
                                />
                              )}
                            </span>
                          )}
                        </>
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

          {!solved &&
            (difficulty !== "speedrun" ||
              game.movableModels.some((item) => !arrangedModelIds.has(item.id))) && (
              <section
                aria-labelledby="timeline-tray-title"
                className={`timeline-tray timeline-tray--${difficulty}${dragOverTarget === "tray" ? " timeline-tray--drop-target" : ""}`}
                data-timeline-tray
                onDragEnter={() => setDragOverTarget("tray")}
                onDragLeave={(event) => {
                  const relatedTarget = event.relatedTarget as Node | null;
                  if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
                    setDragOverTarget(null);
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverTarget("tray");
                }}
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
                        className={`timeline-card timeline-card--movable${draggingModelId === item.id ? " timeline-card--dragging" : ""}${landingModelId === item.id ? " timeline-card--landing" : ""}${landedModelIds.has(item.id) ? " timeline-card--landed" : ""}`}
                        disabled={speedrunUnfinished}
                        draggable={!speedrunUnfinished}
                        key={item.id}
                        onClick={() => {
                          if (!speedrunUnfinished) {
                            setSelectedModelId(selectedModelId === item.id ? null : item.id);
                          }
                        }}
                        onDragStart={(event) => dragStart(event, item.id)}
                        onDragEnd={dragEnd}
                        onPointerDown={(event) => startPointerDrag(event, item.id)}
                        type="button"
                      >
                        <span className="timeline-card__meta">
                          <FaGripVertical aria-hidden />{" "}
                          {timelineCategoryLabel(item.categories, item.itemKind)}
                        </span>
                        <strong>{item.name}</strong>
                      </button>
                    ))}
                  {game.movableModels.every((item) => arrangedModelIds.has(item.id)) && (
                    <p className="timeline-tray__empty">Every card is on the timeline.</p>
                  )}
                </div>
              </section>
            )}

          <div className="timeline-submit">
            {!solved && !speedrunUnfinished && (
              <button
                className="button button--primary"
                disabled={!complete || busy || solved || exhausted || submissionCoolingDown}
                onClick={() => void submit()}
                type="button"
              >
                {busy
                  ? "Checking arrangement…"
                  : solved
                    ? "Timeline solved"
                    : submissionCoolingDown
                      ? `Submit again in ${submissionCooldownRemaining}s`
                      : exhausted
                        ? "No submissions remaining"
                        : "Submit complete timeline"}
              </button>
            )}
            {!complete && !speedrunUnfinished && (
              <p>Fill every position exactly once to submit.</p>
            )}
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
      <TimelineHTP
        hardcoreUnlocked={hardcoreUnlocked}
        open={showHowToPlay}
        onClose={() => setShowHowToPlay(false)}
      />
      {yearAnnotation && (
        <HowToPlayDialog
          closeLabel="Close year note"
          description={`Recorded year: ${formatReleaseDate(yearAnnotation.releaseDate)}`}
          eyebrow="Timeline year"
          onClose={() => setYearAnnotation(null)}
          open
          title={yearAnnotation.name}
        >
          <p>{yearAnnotation.annotation}</p>
        </HowToPlayDialog>
      )}
      {game && solved && showCompletion && (
        <Suspense fallback={null}>
          <TimelineCompletedDialog
            anchorPositions={anchorPositions}
            attempts={acceptedAttempts}
            date={game.challenge.date}
            difficulty={game.challenge.difficulty}
            speedrunTimeMs={difficulty === "speedrun" ? speedrunElapsed : undefined}
            onClose={() => setShowCompletion(false)}
            totalPositions={game.slots.length}
          />
        </Suspense>
      )}
      {difficulty === "speedrun" && showSpeedrunGiveUp && (
        <SpeedrunGiveUpDialog
          onClose={() => setShowSpeedrunGiveUp(false)}
          onConfirm={giveUpSpeedrun}
        />
      )}
      {difficulty === "speedrun" && solved && showSpeedrunUsername && user && (
        <SpeedrunUsernameDialog
          email={user.email}
          onChoose={(value) => void chooseSpeedrunUsername(value)}
        />
      )}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
