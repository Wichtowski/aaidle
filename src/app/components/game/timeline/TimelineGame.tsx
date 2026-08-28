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
  initialTimelinePositions,
  moveTimelineModel,
  restoreTimelinePositions,
  TIMELINE_DESKTOP_COLUMNS,
  timelineArrangementIsComplete,
  timelineVisualPosition,
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
import { HowToPlayDialog } from "../common/dialogs/HowToPlayDialog";
import { readGamePreferences, saveTimelineDifficulty } from "@lib/storage/game-preferences";

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

function formatReleaseDate(value: string) {
  if (/^\d{4}$/.test(value)) return value;
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
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
    return <time dateTime={item.releaseDate}>{formatReleaseDate(item.releaseDate)}</time>;
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
      className="timeline-card__date-help"
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
    speedrunStartedAt: useSaved ? saved?.speedrunStartedAt : undefined,
  };
}

export function TimelineGame() {
  const progress = useLocalProgress();
  const { hardcoreUnlocked, user } = useAuth();
  const [difficulty, setDifficulty] = useState<TimelineDifficulty>(
    () => readGamePreferences().timeline,
  );
  const [game, setGame] = useState<TimelineGamePayload | null>(null);
  const [positions, setPositions] = useState<Array<string | null>>([]);
  const [placements, setPlacements] = useState<Array<0 | 1 | 2 | null> | null>(null);
  const [acceptedAttempts, setAcceptedAttempts] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [speedrunStartedAt, setSpeedrunStartedAt] = useState<number | null>(null);
  const [speedrunElapsed, setSpeedrunElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [draggingModelId, setDraggingModelId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<number | "tray" | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [yearAnnotation, setYearAnnotation] = useState<{
    name: string;
    releaseDate: string;
    annotation: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [validationSequence, setValidationSequence] = useState(0);
  const [landingModelId, setLandingModelId] = useState<string | null>(null);
  const [landedModelIds, setLandedModelIds] = useState<Set<string>>(() => new Set());
  const pendingRequestId = useRef<string | null>(null);
  const completionTimer = useRef<number | null>(null);
  const landingTimer = useRef<number | null>(null);
  const draggingModelIdRef = useRef<string | null>(null);
  const lastPointerTarget = useRef<string | null>(null);
  const pointerY = useRef<number | null>(null);
  const pointerDragActive = useRef(false);
  const autoScrollFrame = useRef<number | null>(null);
  const gameCache = useRef<Partial<Record<TimelineDifficulty, TimelineGamePayload>>>({});

  const selectDifficulty = (nextDifficulty: string) => {
    const value = nextDifficulty as TimelineDifficulty;
    saveTimelineDifficulty(value);
    setDifficulty(value);
  };

  useEffect(() => {
    if (difficulty === "speedrun" && !user) {
      setDifficulty("normal");
      return;
    }
    if (difficulty === "hardcore" && !hardcoreUnlocked) {
      setDifficulty("normal");
      return;
    }
    const cachedGame = gameCache.current[difficulty];
    if (cachedGame && cachedGame.challenge.date === utcDate()) {
      const hydrated = hydrateGame(cachedGame);
      setGame(cachedGame);
      setPositions(hydrated.positions);
      setPlacements(hydrated.placements);
      setAcceptedAttempts(hydrated.acceptedAttempts);
      setAttemptsRemaining(hydrated.attemptsRemaining);
      setSolved(hydrated.solved);
      setSpeedrunStartedAt(hydrated.speedrunStartedAt ?? null);
      setSelectedModelId(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiClient
      .timelineGame(difficulty, progress.playerId, controller.signal)
      .then((nextGame) => {
        if (controller.signal.aborted) return;
        const hydrated = hydrateGame(nextGame);
        gameCache.current[difficulty] = nextGame;
        setGame(nextGame);
        setPositions(hydrated.positions);
        setPlacements(hydrated.placements);
        setAcceptedAttempts(hydrated.acceptedAttempts);
        setAttemptsRemaining(hydrated.attemptsRemaining);
        setSolved(hydrated.solved);
        setSpeedrunStartedAt(hydrated.speedrunStartedAt ?? null);
        setSelectedModelId(null);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [difficulty, hardcoreUnlocked, loadAttempt, progress.playerId, user]);

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
      speedrunStartedAt: speedrunStartedAt ?? undefined,
    });
  }, [acceptedAttempts, attemptsRemaining, game, placements, positions, solved, speedrunStartedAt]);

  useEffect(() => {
    if (difficulty !== "speedrun" || solved || !speedrunStartedAt) return;
    const update = () => setSpeedrunElapsed(Math.max(0, Date.now() - speedrunStartedAt));
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [difficulty, solved, speedrunStartedAt]);

  useEffect(
    () => () => {
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
      if (landingTimer.current !== null) window.clearTimeout(landingTimer.current);
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

  const triggerLanding = useCallback((modelId: string) => {
    if (landingTimer.current !== null) window.clearTimeout(landingTimer.current);
    setLandedModelIds((current) => new Set(current).add(modelId));
    setLandingModelId(modelId);
    landingTimer.current = window.setTimeout(() => {
      setLandingModelId(null);
      landingTimer.current = null;
    }, 560);
  }, []);

  const moveModel = useCallback(
    (modelId: string, targetPosition: number | null) => {
      if (solved) return;
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
    [anchorPositions, placements, solved],
  );

  useEffect(() => {
    if (!draggingModelId || !pointerDragActive.current) return;
    const scrollEdge = 72;
    const maxScrollStep = 10;
    const autoScroll = () => {
      const y = pointerY.current;
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
    if (!game || !complete || busy || solved || exhausted) return;
    const startedAt = difficulty === "speedrun" ? (speedrunStartedAt ?? Date.now()) : null;
    if (difficulty === "speedrun" && speedrunStartedAt === null) setSpeedrunStartedAt(startedAt);
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
        startedAt,
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
        setValidationSequence((sequence) => sequence + 1);
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

  const difficultyControls = (
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
          <div className="timeline-game__status" aria-live="polite">
            <p>
              <strong>{arrangedModelIds.size}</strong> / {positions.length} positions filled
            </p>
            {difficulty === "speedrun" && !solved && (
              <p>
                <strong>{(speedrunElapsed / 1000).toFixed(1)}s</strong> elapsed
              </p>
            )}
            {attemptsRemaining !== null && (
              <p>
                <strong>{attemptsRemaining}</strong> of {game.progress.attemptLimit} submissions
                remaining
              </p>
            )}
          </div>

          <ol
            className={[
              "timeline-board",
              difficulty !== "normal" ? "timeline-board--multirow" : "",
            ].join(" ")}
            key={validationSequence}
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
                      className={`timeline-card timeline-card--movable${solved ? " timeline-card--solved timeline-card--winning" : ""}${placements ? " timeline-card--submitted" : ""}${draggingModelId === item.id ? " timeline-card--dragging" : ""}${landingModelId === item.id ? " timeline-card--landing" : ""}${landedModelIds.has(item.id) ? " timeline-card--landed" : ""}${feedback ? ` timeline-card--${feedback}` : ""}`}
                      draggable={!solved && feedback !== "correct"}
                      onClick={() => {
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
                      <span className="timeline-card__meta">
                        <FaGripVertical aria-hidden />{" "}
                        {timelineCategoryLabel(item.categories, item.itemKind)}
                      </span>
                      <strong>{item.name}</strong>
                      {showDate && item.releaseDate && (
                        <>
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
                        </>
                      )}
                      {feedback && (
                        <span className="timeline-card__feedback">
                          {feedback === "correct" ? (
                            <>
                              <FaCheck aria-hidden="true" size={timelineFeedbackIconSize} /> Correct
                              position
                            </>
                          ) : feedback === "same-year" ? (
                            <>
                              <FaEquals aria-hidden="true" size={timelineFeedbackIconSize} /> Same
                              year
                            </>
                          ) : (
                            <>
                              <FaXmark aria-hidden="true" size={timelineFeedbackIconSize} />{" "}
                              Incorrect position
                            </>
                          )}
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

          {!solved && (
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
                      draggable
                      key={item.id}
                      onClick={() =>
                        setSelectedModelId(selectedModelId === item.id ? null : item.id)
                      }
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
            {!solved && (
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
            )}
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
            onClose={() => setShowCompletion(false)}
            totalPositions={game.slots.length}
          />
        </Suspense>
      )}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
