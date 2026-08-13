import { distribution } from "../utils/dates";
import { canonicalClassicChallengeMode } from "../domain/models/model-types";
import { localProgressSchema, type LocalProgress } from "./local-progress-schema";

export const progressKey = "aaidle:progress:v1";
export const playerIdKey = "aaidle:player-id:v1";
const serverPlayerId = "00000000-0000-4000-8000-000000000000";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function devicePlayerId(fallback?: string) {
  if (typeof window === "undefined") return serverPlayerId;

  const saved = window.localStorage.getItem(playerIdKey);
  if (saved && uuidPattern.test(saved)) return saved;

  const playerId = fallback && uuidPattern.test(fallback) ? fallback : crypto.randomUUID();
  window.localStorage.setItem(playerIdKey, playerId);
  return playerId;
}

export const freshProgress = (): LocalProgress => ({
  version: 1,
  playerId: devicePlayerId(),
  activeMode: "classic",
  games: {},
  stats: {
    classic: {
      currentStreak: 0,
      bestStreak: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      lastPlayedDate: null,
      lastSolvedDate: null,
      guessDistribution: distribution(),
    },
  },
  preferences: {
    reducedMotion: false,
    highContrast: false,
    hasSeenClassicPrivacy: false,
    hardcoreUnlocked: false,
    hellMode: false,
  },
});

const serverSnapshot: LocalProgress = {
  version: 1,
  playerId: serverPlayerId,
  activeMode: "classic",
  games: {},
  stats: {
    classic: {
      currentStreak: 0,
      bestStreak: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      lastPlayedDate: null,
      lastSolvedDate: null,
      guessDistribution: distribution(),
    },
  },
  preferences: {
    reducedMotion: false,
    highContrast: false,
    hasSeenClassicPrivacy: false,
    hardcoreUnlocked: false,
    hellMode: false,
  },
};

function reconcileLocalStats(progress: LocalProgress): LocalProgress {
  const solvedGames = Object.values(progress.games).filter((game) => game.status === "solved");
  const guessDistribution = distribution();
  for (const game of solvedGames) {
    const bucket = game.guesses.length > 9 ? "10+" : String(game.guesses.length);
    guessDistribution[bucket] = (guessDistribution[bucket] ?? 0) + 1;
  }

  return {
    ...progress,
    stats: {
      ...progress.stats,
      classic: {
        ...progress.stats.classic,
        gamesPlayed: solvedGames.length,
        gamesWon: solvedGames.length,
        guessDistribution,
      },
    },
  };
}

function migrateClassicChallengeModes(progress: LocalProgress): LocalProgress {
  let changed = false;
  const games = Object.fromEntries(
    Object.values(progress.games).map((game) => {
      const mode = canonicalClassicChallengeMode(game.mode);
      if (!mode || mode === game.mode) return [`${game.mode}:${game.challengeDate}`, game];

      changed = true;
      return [
        `${mode}:${game.challengeDate}`,
        {
          ...game,
          mode,
        },
      ];
    }),
  );

  return changed ? { ...progress, games } : progress;
}

export function readProgress() {
  if (typeof window === "undefined") return serverSnapshot;

  try {
    const value = window.localStorage.getItem(progressKey);
    const progress = reconcileLocalStats(
      migrateClassicChallengeModes(value ? localProgressSchema.parse(JSON.parse(value)) : freshProgress()),
    );
    const playerId = devicePlayerId(progress.playerId);
    return progress.playerId === playerId ? progress : { ...progress, playerId };
  } catch {
    return freshProgress();
  }
}

let snapshot: LocalProgress = serverSnapshot;
let initialised = false;
const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => serverSnapshot;
export const getInitialisedSnapshot = () => initialised;
export const getServerInitialisedSnapshot = () => false;

export function initialiseProgress() {
  if (initialised) return;

  snapshot = readProgress();
  initialised = true;
  window.addEventListener("storage", (event) => {
    if (event.key === progressKey || event.key === playerIdKey) {
      snapshot = readProgress();
      listeners.forEach((listener) => listener());
    }
  });
  listeners.forEach((listener) => listener());
}

export function updateProgress(mutator: (state: LocalProgress) => LocalProgress) {
  snapshot = mutator(snapshot);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(playerIdKey, snapshot.playerId);
    window.localStorage.setItem(progressKey, JSON.stringify(snapshot));
  }
  listeners.forEach((listener) => listener());
}
