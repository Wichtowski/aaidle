import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@lib/api/client";
import {
  initialTimelinePositions,
  restoreTimelinePositions,
  applyTimelineAutoPlacements,
} from "@lib/domain/games/timeline/timeline-arrangement";
import {
  readSavedTimelineGame,
  saveTimelineGame,
} from "@lib/domain/games/timeline/timeline-progress-store";
import type {
  TimelineDifficulty,
  TimelineGamePayload,
} from "@lib/domain/games/timeline/timeline-types";
import { utcDate } from "@lib/utils/dates";
import { readGamePreferences, saveTimelineDifficulty } from "@lib/storage/game-preferences";
import type { TimelineAssistState } from "@lib/validation/api";

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
    placements: serverAttempt?.placements ?? null,
    acceptedAttempts: serverAttempt?.attemptNumber ?? 0,
    attemptsRemaining: game.progress.attemptsRemaining,
    solved: game.progress.solved,
    speedrunStartedAt: game.progress.speedrunStartedAt ?? undefined,
    speedrunGivenUpAt: game.progress.speedrunGivenUpAt ?? undefined,
    speedrunTimeMs:
      serverAttempt?.speedrunTimeMs ??
      (game.progress.speedrunStartedAt && game.progress.speedrunGivenUpAt
        ? Math.max(0, game.progress.speedrunGivenUpAt - game.progress.speedrunStartedAt)
        : undefined),
  };
}

export function useTimelineGame({
  canSpeedrun,
  hardcoreUnlocked,
  playerId,
  requestedDate,
}: {
  canSpeedrun: boolean;
  hardcoreUnlocked: boolean;
  playerId: string;
  requestedDate?: string;
}) {
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
  const [speedrunGivenUpAt, setSpeedrunGivenUpAt] = useState<number | null>(null);
  const [speedrunElapsed, setSpeedrunElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [assistance, setAssistance] = useState<TimelineAssistState | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistReload, setAssistReload] = useState(0);
  const gameCache = useRef<Partial<Record<TimelineDifficulty, TimelineGamePayload>>>({});
  const assistRequest = useRef<AbortController | null>(null);

  useEffect(() => () => assistRequest.current?.abort(), [game?.challenge.id, playerId]);

  const applyAssistance = useCallback((next: TimelineAssistState) => {
    setAssistance(next);
    setPositions((current) => applyTimelineAutoPlacements(current, next.autoPlacements));
    setPlacements((current) => {
      const nextPlacements = current ? [...current] : [];
      for (const placement of next.autoPlacements) nextPlacements[placement.position] = 1;
      return next.autoPlacements.length ? nextPlacements : current;
    });
  }, []);

  useEffect(() => {
    setAssistance(null);
    setAssistError(null);
    if (!game || loading || !["normal", "challenge"].includes(difficulty)) return;
    const controller = new AbortController();
    void apiClient
      .timelineAssists(game.challenge.id, undefined, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) applyAssistance(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAssistError("We could not load Auto-place progress.");
      });
    return () => controller.abort();
  }, [
    game?.challenge.id,
    loading,
    difficulty,
    acceptedAttempts,
    playerId,
    assistReload,
    applyAssistance,
  ]);

  async function autoPlace(cardId: string) {
    if (!game || assistBusy) return;
    setAssistBusy(true);
    setAssistError(null);
    const controller = new AbortController();
    assistRequest.current = controller;
    try {
      const next = await apiClient.timelineAssists(game.challenge.id, cardId, controller.signal);
      if (!controller.signal.aborted) applyAssistance(next);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setAssistError(
          failure instanceof Error ? failure.message : "We could not place this card.",
        );
      }
    } finally {
      setAssistBusy(false);
    }
  }

  const selectDifficulty = (nextDifficulty: string) => {
    const value = nextDifficulty as TimelineDifficulty;
    saveTimelineDifficulty(value);
    setDifficulty(value);
  };

  useEffect(() => {
    if (difficulty === "speedrun" && !canSpeedrun) {
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
      setSpeedrunGivenUpAt(hydrated.speedrunGivenUpAt ?? null);
      setSpeedrunElapsed(hydrated.speedrunTimeMs ?? 0);
      setSelectedModelId(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiClient
      .timelineGame(difficulty, playerId, controller.signal, requestedDate)
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
        setSpeedrunGivenUpAt(hydrated.speedrunGivenUpAt ?? null);
        setSpeedrunElapsed(hydrated.speedrunTimeMs ?? 0);
        setSelectedModelId(null);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canSpeedrun, difficulty, hardcoreUnlocked, loadAttempt, playerId, requestedDate]);

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
      assistance: assistance ?? undefined,
    });
  }, [
    acceptedAttempts,
    assistance,
    attemptsRemaining,
    game,
    placements,
    positions,
    solved,
    speedrunStartedAt,
  ]);

  useEffect(() => {
    if (difficulty !== "speedrun" || solved || speedrunGivenUpAt || !speedrunStartedAt) return;
    const update = () => setSpeedrunElapsed(Math.max(0, Date.now() - speedrunStartedAt));
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [difficulty, solved, speedrunGivenUpAt, speedrunStartedAt]);

  useEffect(() => {
    if (difficulty !== "speedrun" || solved || speedrunGivenUpAt || !speedrunStartedAt) return;
    const preventSpeedrunExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "Your Speedrun timer will continue if you leave this page.";
    };
    window.addEventListener("beforeunload", preventSpeedrunExit);
    return () => window.removeEventListener("beforeunload", preventSpeedrunExit);
  }, [difficulty, solved, speedrunGivenUpAt, speedrunStartedAt]);

  return {
    assistance,
    assistBusy,
    assistError,
    autoPlace,
    retryAssistance: () => setAssistReload((value) => value + 1),
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
  };
}
