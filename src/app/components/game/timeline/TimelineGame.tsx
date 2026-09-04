import { Button } from "@components/ui/Button";
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
  const [pointerDragPosition, setPointerDragPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [pointerDragReturning, setPointerDragReturning] = useState(false);
  const [pointerDragSnapping, setPointerDragSnapping] = useState(false);
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
  const [swapAnimation, setSwapAnimation] = useState<{
    modelId: string;
    x: number;
    y: number;
  } | null>(null);
  const [submissionCooldownRemaining, setSubmissionCooldownRemaining] = useState(0);
  const pendingRequestId = useRef<string | null>(null);
  const completionTimer = useRef<number | null>(null);
  const landingTimer = useRef<number | null>(null);
  const swapTimer = useRef<number | null>(null);
  const draggingModelIdRef = useRef<string | null>(null);
  const lastPointerTarget = useRef<string | null>(null);
  const pointerY = useRef<number | null>(null);
  const pointerTarget = useRef<{ x: number; y: number } | null>(null);
  const pointerPreview = useRef<{ x: number; y: number } | null>(null);
  const pointerDragOffset = useRef({ x: 20, y: 20 });
  const pointerDragOrigin = useRef<{ x: number; y: number } | null>(null);
  const pointerDragReturningRef = useRef(false);
  const pointerDragSource = useRef<HTMLElement | null>(null);
  const pointerDragSize = useRef<{ width: number; height: number } | null>(null);
  const pointerDragTargetSize = useRef<{ width: number; height: number } | null>(null);
  const pendingPointerDrop = useRef<{ modelId: string; position: number } | null>(null);
  const suppressPointerClickUntil = useRef(0);
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
      if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
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
    const maxScrollStep = 150;
    const autoScroll = () => {
      if (!pointerDragActive.current) {
        autoScrollFrame.current = null;
        return;
      }
      const target = pointerTarget.current;
      const current = pointerPreview.current;
      if (target && current) {
        const followRate = pointerDragReturningRef.current ? 0.2 : 0.14;
        const next = {
          x: current.x + (target.x - current.x) * followRate,
          y: current.y + (target.y - current.y) * followRate,
        };
        pointerPreview.current = next;
        const currentSize = pointerDragSize.current;
        const targetSize = pointerDragTargetSize.current;
        if (currentSize && targetSize) {
          pointerDragSize.current = {
            height: currentSize.height + (targetSize.height - currentSize.height) * followRate,
            width: currentSize.width + (targetSize.width - currentSize.width) * followRate,
          };
        }
        setPointerDragPosition(next);
        if (
          pointerDragReturningRef.current &&
          Math.hypot(target.x - next.x, target.y - next.y) < 0.75
        ) {
          const pendingDrop = pendingPointerDrop.current;
          if (pendingDrop) {
            setLandedModelIds((current) => new Set(current).add(pendingDrop.modelId));
          }
          pointerDragActive.current = false;
          pointerDragReturningRef.current = false;
          draggingModelIdRef.current = null;
          pointerTarget.current = null;
          pointerPreview.current = null;
          pointerDragSource.current = null;
          pointerDragTargetSize.current = null;
          pendingPointerDrop.current = null;
          setDraggingModelId(null);
          setPointerDragPosition(null);
          setPointerDragReturning(false);
          setPointerDragSnapping(false);
          autoScrollFrame.current = null;
          return;
        }
      }
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
    if (pointerDragActive.current && autoScrollFrame.current === null) {
      autoScrollFrame.current = window.requestAnimationFrame(autoScroll);
    }

    const resolveTarget = (clientX: number, clientY: number) => {
      const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const slot = target?.closest<HTMLElement>("[data-timeline-position]");
      const tray = target?.closest<HTMLElement>("[data-timeline-tray]");
      return slot?.dataset.timelinePosition ?? (tray ? "tray" : null);
    };
    const pointerMove = (event: globalThis.PointerEvent) => {
      if (!pointerDragActive.current || pointerDragReturningRef.current) return;
      event.preventDefault();
      const origin = pointerDragOrigin.current;
      if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 4) {
        suppressPointerClickUntil.current = Date.now() + 500;
      }
      pointerY.current = event.clientY;
      pointerTarget.current = { x: event.clientX, y: event.clientY };
      if (autoScrollFrame.current === null) {
        autoScrollFrame.current = window.requestAnimationFrame(autoScroll);
      }
      const targetKey = resolveTarget(event.clientX, event.clientY);
      setDragOverTarget(
        targetKey === "tray" ? "tray" : targetKey === null ? null : Number(targetKey),
      );
      lastPointerTarget.current = targetKey;
    };
    const pointerUp = (event: globalThis.PointerEvent) => {
      if (!pointerDragActive.current || pointerDragReturningRef.current) return;
      const targetKey = resolveTarget(event.clientX, event.clientY);
      if (targetKey === null && pointerDragOrigin.current) {
        const sourceRect = pointerDragSource.current?.getBoundingClientRect();
        pointerDragReturningRef.current = true;
        pointerTarget.current = sourceRect
          ? {
              x: sourceRect.left + pointerDragOffset.current.x,
              y: sourceRect.top + pointerDragOffset.current.y,
            }
          : pointerDragOrigin.current;
        pointerDragTargetSize.current = sourceRect
          ? { height: sourceRect.height, width: sourceRect.width }
          : pointerDragSize.current;
        pointerY.current = null;
        setPointerDragReturning(true);
        setPointerDragSnapping(false);
        setDragOverTarget(null);
        return;
      }
      const modelId = draggingModelIdRef.current ?? draggingModelId;
      if (modelId && targetKey !== null && targetKey !== "tray") {
        const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-timeline-position]");
        const targetCard = target?.querySelector<HTMLElement>(
          ".timeline-card, .timeline-slot__empty",
        );
        const targetRect = targetCard?.getBoundingClientRect();
        if (targetRect) {
          const targetPosition = Number(targetKey);
          const sourcePosition = positions.indexOf(modelId);
          const displacedModelId = positions[targetPosition];
          const sourceRect = pointerDragSource.current?.getBoundingClientRect();
          pointerDragReturningRef.current = true;
          pendingPointerDrop.current = { modelId, position: targetPosition };
          pointerTarget.current = {
            x: targetRect.left + pointerDragOffset.current.x,
            y: targetRect.top + pointerDragOffset.current.y,
          };
          pointerDragTargetSize.current = {
            height: targetRect.height,
            width: targetRect.width,
          };
          pointerY.current = null;
          setLandedModelIds((current) => {
            const next = new Set(current).add(modelId);
            if (displacedModelId) next.add(displacedModelId);
            return next;
          });
          if (
            displacedModelId &&
            displacedModelId !== modelId &&
            sourcePosition >= 0 &&
            sourceRect
          ) {
            if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
            setSwapAnimation({
              modelId: displacedModelId,
              x: targetRect.left - sourceRect.left,
              y: targetRect.top - sourceRect.top,
            });
            swapTimer.current = window.setTimeout(() => {
              setSwapAnimation(null);
              swapTimer.current = null;
            }, 480);
          }
          moveModel(modelId, targetPosition);
          setPointerDragSnapping(true);
          setDragOverTarget(null);
          return;
        }
      }
      if (modelId && targetKey === "tray") {
        moveModel(modelId, null);
        triggerLanding(modelId);
      }
      pointerDragActive.current = false;
      draggingModelIdRef.current = null;
      setDraggingModelId(null);
      setPointerDragPosition(null);
      setDragOverTarget(null);
      lastPointerTarget.current = null;
      pointerY.current = null;
      pointerTarget.current = null;
      pointerPreview.current = null;
      pointerDragSource.current = null;
      pointerDragTargetSize.current = null;
      pendingPointerDrop.current = null;
      pointerDragReturningRef.current = false;
      setPointerDragReturning(false);
      setPointerDragSnapping(false);
    };
    const pointerCancel = () => {
      pointerDragActive.current = false;
      pointerDragReturningRef.current = false;
      draggingModelIdRef.current = null;
      setDraggingModelId(null);
      setPointerDragPosition(null);
      pointerTarget.current = null;
      pointerPreview.current = null;
      pointerDragSource.current = null;
      pointerDragTargetSize.current = null;
      pendingPointerDrop.current = null;
      setPointerDragReturning(false);
      setPointerDragSnapping(false);
      setDragOverTarget(null);
      lastPointerTarget.current = null;
      pointerY.current = null;
    };
    window.addEventListener("pointermove", pointerMove, { passive: false });
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerCancel);
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
  }, [draggingModelId, moveModel, positions, triggerLanding]);

  const dragStart = (event: DragEvent, modelId: string) => {
    const position = positions.indexOf(modelId);
    if (position >= 0 && placements?.[position] === 1) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", modelId);
    const source = event.currentTarget;
    const sourceRect = source.getBoundingClientRect();
    const preview = source.cloneNode(true) as HTMLElement;
    preview.classList.remove("timeline-card--dragging", "timeline-card--drag-origin");
    preview.style.width = `${sourceRect.width}px`;
    preview.style.height = `${sourceRect.height}px`;
    preview.style.animation = "none";
    preview.style.position = "fixed";
    preview.style.top = "-10000px";
    preview.style.left = "-10000px";
    preview.style.pointerEvents = "none";
    preview.style.transform = "none";
    preview.style.opacity = "1";
    document.body.appendChild(preview);
    preview.getBoundingClientRect();
    event.dataTransfer.setDragImage(preview, 20, 20);
    window.setTimeout(() => preview.remove(), 0);
    pointerDragActive.current = false;
    draggingModelIdRef.current = modelId;
    setDraggingModelId(modelId);
  };
  const dragEnd = () => {
    pointerDragActive.current = false;
    draggingModelIdRef.current = null;
    setDraggingModelId(null);
    setPointerDragPosition(null);
    pointerTarget.current = null;
    pointerPreview.current = null;
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
    pointerDragActive.current = false;
    draggingModelIdRef.current = null;
    setDraggingModelId(null);
    setPointerDragPosition(null);
    setDragOverTarget(null);
  };
  const startPointerDrag = (event: PointerEvent, modelId: string) => {
    if (speedrunUnfinished) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const slotPosition = positions.indexOf(modelId);
    if (slotPosition >= 0 && placements?.[slotPosition] === 1) return;
    event.preventDefault();
    pointerDragActive.current = true;
    draggingModelIdRef.current = modelId;
    const sourceRect = event.currentTarget.getBoundingClientRect();
    const pointerPosition = { x: event.clientX, y: event.clientY };
    pointerDragOffset.current = {
      x: event.clientX - sourceRect.left,
      y: event.clientY - sourceRect.top,
    };
    pointerDragSize.current = { width: sourceRect.width, height: sourceRect.height };
    pointerDragOrigin.current = pointerPosition;
    pointerDragSource.current = event.currentTarget as HTMLElement;
    pointerDragReturningRef.current = false;
    pointerDragTargetSize.current = null;
    pendingPointerDrop.current = null;
    setLandingModelId(null);
    setPointerDragReturning(false);
    setPointerDragSnapping(false);
    pointerTarget.current = pointerPosition;
    pointerPreview.current = pointerPosition;
    setPointerDragPosition(pointerPosition);
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
      <Button
        variant="outline"
        to={
          game
            ? `/timeline/leaderboard/${game.challenge.date.replaceAll("-", "")}`
            : "/timeline/leaderboard"
        }
      >
        Leaderboard
      </Button>
      <Button
        aria-pressed={focusMode}
        variant="outline"
        size="small"
        onClick={() => setFocusMode((focused) => !focused)}
        type="button"
      >
        {focusMode ? "Exit focus" : "Focus mode"}
      </Button>
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
  const pointerDraggedItem = draggingModelId ? itemById.get(draggingModelId) : null;

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
                  <Button
                    variant="primary"
                    color="black"
                    size="small"
                    className="timeline-game__speedrun-start"
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
                  </Button>
                )}
                {difficulty === "speedrun" &&
                  !solved &&
                  !speedrunUnfinished &&
                  speedrunStartedAt !== null && (
                    <Button
                      variant="outline"
                      color="danger"
                      className="timeline-game__speedrun-give-up"
                      disabled={busy}
                      onClick={() => setShowSpeedrunGiveUp(true)}
                      type="button"
                    >
                      Give up
                    </Button>
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
                      className={`timeline-card timeline-card--movable${solved ? " timeline-card--solved timeline-card--winning" : ""}${placements ? " timeline-card--submitted" : ""}${speedrunCovered ? " timeline-card--covered" : ""}${isDragOrigin ? " timeline-card--dragging timeline-card--drag-origin" : ""}${landingModelId === item.id ? " timeline-card--landing" : ""}${landedModelIds.has(item.id) ? " timeline-card--landed" : ""}${swapAnimation?.modelId === item.id ? " timeline-card--swapping" : ""}${feedback ? ` timeline-card--${feedback}` : ""}`}
                      disabled={
                        difficulty === "speedrun" &&
                        (speedrunStartedAt === null || speedrunUnfinished)
                      }
                      draggable={false}
                      onClick={(event) => {
                        if (Date.now() < suppressPointerClickUntil.current) {
                          event.preventDefault();
                          return;
                        }
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
                      style={
                        swapAnimation?.modelId === item.id
                          ? ({
                              "--timeline-swap-x": `${swapAnimation.x}px`,
                              "--timeline-swap-y": `${swapAnimation.y}px`,
                            } as CSSProperties)
                          : undefined
                      }
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
                                      <FaEquals
                                        aria-hidden="true"
                                        size={timelineFeedbackIconSize}
                                      />{" "}
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
                        className={`timeline-card timeline-card--movable${draggingModelId === item.id ? " timeline-card--dragging timeline-card--drag-origin" : ""}${landingModelId === item.id ? " timeline-card--landing" : ""}${landedModelIds.has(item.id) ? " timeline-card--landed" : ""}`}
                        disabled={speedrunUnfinished}
                        draggable={false}
                        key={item.id}
                        onClick={(event) => {
                          if (Date.now() < suppressPointerClickUntil.current) {
                            event.preventDefault();
                            return;
                          }
                          if (speedrunUnfinished) return;
                          setSelectedModelId(selectedModelId === item.id ? null : item.id);
                        }}
                        onDragStart={(event) => dragStart(event, item.id)}
                        onDragEnd={dragEnd}
                        onPointerDown={(event) => startPointerDrag(event, item.id)}
                        type="button"
                      >
                        {draggingModelId === item.id ? (
                          <span>Drop here</span>
                        ) : (
                          <>
                            <span className="timeline-card__meta">
                              <FaGripVertical aria-hidden />{" "}
                              {timelineCategoryLabel(item.categories, item.itemKind)}
                            </span>
                            <strong>{item.name}</strong>
                          </>
                        )}
                      </button>
                    ))}
                  {game.movableModels.every((item) => arrangedModelIds.has(item.id)) && (
                    <p className="timeline-tray__empty">Every card is on the timeline.</p>
                  )}
                </div>
              </section>
            )}

          {pointerDragPosition && pointerDraggedItem && (
            <div
              aria-hidden="true"
              className={`timeline-card timeline-card--movable timeline-card--pointer-dragging${pointerDragReturning ? " timeline-card--pointer-returning" : ""}${pointerDragSnapping ? " timeline-card--pointer-snapping" : ""}`}
              style={
                {
                  height: pointerDragSize.current?.height,
                  left: pointerDragPosition.x,
                  top: pointerDragPosition.y,
                  transform: `translate(${-pointerDragOffset.current.x}px, ${-pointerDragOffset.current.y}px) rotate(${pointerDragSnapping ? 0 : 1}deg)`,
                  width: pointerDragSize.current?.width,
                } as CSSProperties
              }
            >
              <span className="timeline-card__meta">
                <FaGripVertical aria-hidden />{" "}
                {timelineCategoryLabel(pointerDraggedItem.categories, pointerDraggedItem.itemKind)}
              </span>
              <strong>{pointerDraggedItem.name}</strong>
            </div>
          )}

          <div className="timeline-submit">
            {!solved && !speedrunUnfinished && (
              <Button
                variant="primary"
                color="black"
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
              </Button>
            )}
            {!complete && !speedrunUnfinished && <p>Fill every position exactly once to submit.</p>}
            {exhausted && (
              <p>Your final arrangement remains private. The answer is not revealed.</p>
            )}
          </div>
          {solved && !showCompletion && (
            <div className="game-completion-action">
              <Button variant="outline" onClick={() => setShowCompletion(true)} type="button">
                Show winning timeline
              </Button>
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
