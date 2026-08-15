import { localProgressSchema, type LocalProgress } from "../../storage/local-progress-schema";
import { distribution } from "../../utils/dates";

type StoredGame = LocalProgress["games"][string];

function mergeGame(current: StoredGame, incoming: StoredGame): StoredGame {
  const guesses = Object.values(
    Object.fromEntries(
      [...current.guesses, ...incoming.guesses].map((guess) => [guess.requestId, guess]),
    ),
  ).sort((left, right) => left.attemptedAt.localeCompare(right.attemptedAt));
  const completedAt =
    [current.completedAt, incoming.completedAt]
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;

  return {
    ...current,
    ...incoming,
    status: current.status === "solved" || incoming.status === "solved" ? "solved" : "in-progress",
    guesses,
    startedAt: current.startedAt < incoming.startedAt ? current.startedAt : incoming.startedAt,
    completedAt,
  };
}

function reconcileStats(progress: LocalProgress): LocalProgress {
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

export function parseCloudProgress(value: unknown): LocalProgress {
  return reconcileStats(localProgressSchema.parse(value));
}

export function mergeCloudProgress(
  current: LocalProgress | null,
  incoming: LocalProgress,
): LocalProgress {
  if (!current) return reconcileStats(incoming);

  const games = { ...current.games };
  for (const [key, game] of Object.entries(incoming.games)) {
    games[key] = games[key] ? mergeGame(games[key], game) : game;
  }

  return reconcileStats({
    ...current,
    ...incoming,
    playerId: current.playerId,
    games,
    preferences: {
      ...current.preferences,
      ...incoming.preferences,
      hardcoreUnlocked:
        current.preferences.hardcoreUnlocked || incoming.preferences.hardcoreUnlocked,
      hasAutoplayedHardcoreSoundtrack:
        current.preferences.hasAutoplayedHardcoreSoundtrack ||
        incoming.preferences.hasAutoplayedHardcoreSoundtrack,
    },
  });
}
