import { z } from "zod";
import { localProgressSchema, type LocalProgress } from "../../storage/local-progress-schema";
import { distribution } from "../../utils/dates";

export const serverProgressSchema = z.object({
  version: z.literal(1),
  playerId: z.uuid(),
  games: z.array(
    z.object({
      challengeId: z.string(),
      challengeDate: z.string(),
      mode: z.string(),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
  stats: z.object({
    currentStreak: z.number(),
    bestStreak: z.number(),
    gamesPlayed: z.number(),
  }),
  preferences: z.object({
    hasSeenClassicHowToPlay: z.boolean(),
    innerCircleActive: z.boolean(),
    hellMode: z.boolean(),
    hasAutoplayedHardcoreSoundtrack: z.boolean(),
  }),
});

export type ServerProgress = z.infer<typeof serverProgressSchema>;

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
    const bucket = game.guesses.length > 8 ? "8+" : String(game.guesses.length);
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

export function expandServerProgress(server: ServerProgress): LocalProgress {
  return localProgressSchema.parse({
    version: server.version,
    playerId: server.playerId,
    activeMode: "classic",
    games: Object.fromEntries(
      server.games.map((game) => [
        `${game.mode}:${game.challengeDate}`,
        {
          ...game,
          status: game.completedAt ? "solved" : "in-progress",
          guesses: [],
        },
      ]),
    ),
    stats: {
      classic: {
        ...server.stats,
        gamesWon: server.stats.gamesPlayed,
        lastPlayedDate: null,
        lastSolvedDate: null,
        guessDistribution: distribution(),
      },
    },
    preferences: {
      reducedMotion: false,
      highContrast: false,
      hasSeenClassicPrivacy: false,
      hasSeenClassicHowToPlay: server.preferences.hasSeenClassicHowToPlay,
      hardcoreUnlocked: false,
      innerCircleActive: server.preferences.innerCircleActive,
      hellMode: server.preferences.hellMode,
      hasAutoplayedHardcoreSoundtrack: server.preferences.hasAutoplayedHardcoreSoundtrack,
    },
  });
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

export function mergeServerProgress(server: ServerProgress, local: LocalProgress): LocalProgress {
  const merged = mergeCloudProgress(expandServerProgress(server), local);
  return localProgressSchema.parse({
    ...merged,
    playerId: server.playerId,
    stats: {
      classic: {
        ...merged.stats.classic,
        ...server.stats,
        gamesWon: server.stats.gamesPlayed,
      },
    },
    preferences: {
      ...merged.preferences,
      ...server.preferences,
    },
  });
}
