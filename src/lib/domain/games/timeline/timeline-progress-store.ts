import type { TimelineDifficulty } from "./timeline-types";

const timelineProgressKey = "aaidle:timeline-progress:v1";

export type SavedTimelineGame = {
  challengeId: string;
  challengeDate: string;
  difficulty: TimelineDifficulty;
  positions: Array<string | null>;
  placements: Array<0 | 1> | null;
  acceptedAttempts: number;
  attemptsRemaining: number | null;
  solved: boolean;
  updatedAt: string;
};

type TimelineProgress = {
  version: 1;
  games: Record<string, SavedTimelineGame>;
};

const emptyProgress = (): TimelineProgress => ({ version: 1, games: {} });

function readTimelineProgress(): TimelineProgress {
  if (typeof window === "undefined") return emptyProgress();
  try {
    const value = JSON.parse(window.localStorage.getItem(timelineProgressKey) ?? "null") as unknown;
    if (!value || typeof value !== "object") return emptyProgress();
    const progress = value as Partial<TimelineProgress>;
    if (progress.version !== 1 || !progress.games || typeof progress.games !== "object") {
      return emptyProgress();
    }
    return { version: 1, games: progress.games };
  } catch {
    return emptyProgress();
  }
}

export function readSavedTimelineGame(challengeId: string): SavedTimelineGame | null {
  const game = readTimelineProgress().games[challengeId];
  if (
    !game ||
    game.challengeId !== challengeId ||
    !Array.isArray(game.positions) ||
    !Number.isInteger(game.acceptedAttempts)
  ) {
    return null;
  }
  return game;
}

export function readSavedTimelineGames() {
  return Object.values(readTimelineProgress().games).filter(
    (game): game is SavedTimelineGame =>
      Boolean(game) && Array.isArray(game.positions) && Number.isInteger(game.acceptedAttempts),
  );
}

export function saveTimelineGame(game: SavedTimelineGame) {
  if (typeof window === "undefined") return;
  const progress = readTimelineProgress();
  progress.games[game.challengeId] = game;
  window.localStorage.setItem(timelineProgressKey, JSON.stringify(progress));
}
