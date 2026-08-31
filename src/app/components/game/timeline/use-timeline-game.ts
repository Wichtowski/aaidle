import { useEffect, useRef, useState } from "react";
import { apiClient } from "@lib/api/client";
import {
  initialTimelinePositions,
  restoreTimelinePositions,
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
    speedrunStartedAt: game.progress.speedrunStartedAt ?? undefined,
    speedrunTimeMs: serverAttempt?.speedrunTimeMs,
  };
}

export function useTimelineGame({
  canSpeedrun,
  hardcoreUnlocked,
  playerId,
}: {
  canSpeedrun: boolean;
  hardcoreUnlocked: boolean;
  playerId: string;
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
  const [speedrunElapsed, setSpeedrunElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const gameCache = useRef<Partial<Record<TimelineDifficulty, TimelineGamePayload>>>({});

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
      .timelineGame(difficulty, playerId, controller.signal)
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
  }, [canSpeedrun, difficulty, hardcoreUnlocked, loadAttempt, playerId]);

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

  useEffect(() => {
    if (difficulty !== "speedrun" || solved || !speedrunStartedAt) return;
    const preventSpeedrunExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "Your Speedrun timer will continue if you leave this page.";
    };
    window.addEventListener("beforeunload", preventSpeedrunExit);
    return () => window.removeEventListener("beforeunload", preventSpeedrunExit);
  }, [difficulty, solved, speedrunStartedAt]);

  return {
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
    setSpeedrunStartedAt,
    solved,
    speedrunElapsed,
    speedrunStartedAt,
  };
}
