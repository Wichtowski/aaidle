import type { UserPermission } from "../auth/permissions";
import type { PublicDailyChallengeDto } from "../domain/challenges/challenge-types";
import type { ClassicComparison } from "../domain/guesses/comparison-types";
import type {
  ClassicCategory,
  ClassicDifficulty,
  ComparableModel,
  PublicGuessedModel,
  PublicModelIndex,
} from "../domain/models/model-types";
import type { LocalProgress } from "../storage/local-progress-schema";
import type {
  TimelineAttemptPayload,
  TimelineDifficulty,
  TimelineGamePayload,
  TimelineGlobalLeaderboardPayload,
  TimelineLeaderboardPayload,
  TimelineSpeedrunStartPayload,
} from "../domain/games/timeline/timeline-types";
import type { Difficulty } from "../domain/difficulty";

const apiPath = (path: string) => `/api/v1${path}`;

try {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem("aaidle.access-token");
  }
} catch {
  // Storage may be unavailable in privacy-restricted browser contexts.
}

const csrfToken = () => {
  if (typeof document === "undefined") return null;
  return (
    document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("aaidle_csrf="))
      ?.slice("aaidle_csrf=".length) ?? null
  );
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  username?: string | null;
  emailVerified: boolean;
  permission: UserPermission;
  disabled: boolean;
  disabledReason: string | null;
};

export type AdminUserSummary = {
  id: string;
  email: string;
  displayName: string | null;
  emailVerifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
  permission: UserPermission;
  disabledAt: number | null;
  disabledReason: string | null;
  disabledByEmail?: string | null;
  signInProviders: string[];
  lastSeenAt: number | null;
  progressUpdatedAt: number | null;
  completionCount: number;
  issueReportLimit: number;
};

export type AdminUserDetail = AdminUserSummary & {
  hardcoreUnlocked: boolean;
  progress: unknown | null;
  trajectoryTargets?: Record<string, ComparableModel>;
  trajectoryReferenceModels?: ComparableModel[];
  completions: Array<{
    challengeId: string;
    challengeDate: string;
    mode: string;
    answerModelName: string;
    completedAt: number;
  }>;
};

export type ClassicGamePayload = {
  challenge: PublicDailyChallengeDto;
  models: PublicModelIndex[];
  columns: string[];
  globalCompletionCount: number;
};

export type ClassicGuessPayload = {
  guess: {
    isCorrect: boolean;
    sameGuessCount: number;
    matchingFamily: string[];
    matchingCategories: string[];
    matchingInputModalities: string[];
    matchingOutputModalities: string[];
    matchingUseCases: string[];
    model: ComparableModel;
    comparison: ClassicComparison;
  };
  trajectoryAccessToken: string | null;
  globalCompletionCount: number | null;
};

export type VisualClue =
  | { type: "emoji"; value: string; action?: "replace"; toValue?: string; revealPriority?: number }
  | { type: "icon"; icon: string; revealPriority?: number }
  | { type: "image"; src: string; alt?: string; revealPriority?: number };

export type EmojiDifficulty = Difficulty;
export type EmojiGamePayload = {
  challenge: {
    id: string;
    date: string;
    mode: string;
    difficulty: EmojiDifficulty;
    expiresAt: string;
    clues: VisualClue[];
    maximumClues: number;
  };
  entities: Array<{ id: string; name: string; aliases: string[]; entityKind: string }>;
  globalCompletionCount: number;
};
export type HardcoreStatus = {
  signedIn: boolean;
  unlocked: boolean;
  completedCategories: string[];
  requiredCategories: string[];
};
export type ProgressHistory = {
  games: Array<{
    challengeId: string;
    challengeDate: string;
    mode: string;
    status: "in-progress" | "solved";
    guessCount: number;
    guessedModelNames: string[];
  }>;
  total: number;
  page: number;
  pageSize: number;
  stats: {
    currentStreak: number;
    bestStreak: number;
    gamesPlayed: number;
    gamesWon: number;
    guessDistribution: Record<string, number>;
  };
};

type ApiErrorPayload = { error?: { code?: string; message?: string } };
type PublicModel = {
  id: string;
  name: string;
  providerName: string;
  familyName: string | null;
  aliases: string[];
};

type V2ClassicGame = {
  challenge: { id: string; date: string; expiresAt: string };
  models: PublicModel[];
  columns: string[];
  globalCompletionCount: number;
};

type V2ClassicGuess = {
  guessedModel: PublicGuessedModel;
  comparison: ClassicComparison;
  matchingFamily: string[];
  matchingCategories: string[];
  matchingInputModalities: string[];
  matchingOutputModalities: string[];
  matchingUseCases: string[];
  isCorrect: boolean;
  globalCompletionCount: number;
  trajectoryAccessToken?: string;
};

type V2ClassicGuessHistoryEntry = Omit<
  V2ClassicGuess,
  "globalCompletionCount" | "trajectoryAccessToken"
> & {
  requestId: string;
  attemptedAt: number;
  attemptNumber: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const retryAfterSeconds = (response: Response): number | undefined => {
  const value = response.headers?.get("retry-after")?.trim();
  if (!value) return undefined;
  const deltaSeconds = Number(value);
  if (Number.isFinite(deltaSeconds) && deltaSeconds >= 0) return Math.ceil(deltaSeconds);
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
};

const retryAfterDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  if (seconds < 3_600) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.ceil(seconds / 3_600);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
};

export class NetworkError extends Error {
  constructor(message = "The service could not be reached. Check your connection and retry.") {
    super(message);
    this.name = "NetworkError";
  }
}

export function isApiUnavailable(error: unknown) {
  return error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
}

type ComparableModelSource = Pick<PublicGuessedModel, "id" | "name" | "provider"> &
  Partial<Omit<PublicGuessedModel, "id" | "name" | "provider" | "family">> & {
    family?: unknown;
  };

const stringArray = (value: unknown): string[] | null => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : null;
};

const toComparableModel = (model: ComparableModelSource): ComparableModel => ({
  id: model.id,
  name: model.name,
  provider: model.provider,
  country: model.country ?? null,
  family: stringArray(model.family),
  categories: model.categories ?? null,
  inputModalities: model.inputModalities ?? null,
  outputModalities: model.outputModalities ?? null,
  useCases: model.useCases ?? null,
  reasoningSupport: model.reasoningSupport ?? null,
  weightAvailability: model.weightAvailability ?? null,
  categoryDetails: model.categoryDetails ?? {},
  releaseYear: model.releaseYear ?? null,
  releaseDate: model.releaseDate ?? null,
  contextWindowTokens: model.contextWindowTokens ?? null,
});

class ApiClient {
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = init.method?.toUpperCase() ?? "GET";
    const csrf = method === "GET" || method === "HEAD" ? null : csrfToken();
    let response: Response;
    try {
      response = await fetch(apiPath(path), {
        ...init,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(csrf ? { "X-AAIdle-CSRF-Token": csrf } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new NetworkError();
    }

    const payload = (
      response.status === 204 ? undefined : await response.json().catch(() => null)
    ) as (T & ApiErrorPayload) | null;
    if (!response.ok) {
      const message = payload?.error?.message;
      const retryAfter = response.status === 429 ? retryAfterSeconds(response) : undefined;
      throw new ApiError(
        retryAfter === undefined
          ? message === "Request failed. Please try again."
            ? "We could not complete that request."
            : (message ?? "We could not complete that request.")
          : `Too many requests. Try again in ${retryAfterDuration(retryAfter)}.`,
        response.status,
        payload?.error?.code,
        retryAfter,
      );
    }
    return payload as T;
  }

  currentUser() {
    return this.request<{ user: AuthUser | null }>("/auth/me", { cache: "no-store" })
      .then(({ user }) => user)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      });
  }

  signOut() {
    return this.request<void>("/auth/logout", { method: "POST" });
  }

  signInWithPassword(email: string, password: string) {
    return this.request<{ user: AuthUser }>("/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }

  register(email: string, password: string, username?: string) {
    return this.request<{ accepted: true; activationUrl?: string }>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username: username || undefined }),
    });
  }

  updateUsername(username: string | null) {
    return this.request<{ user: AuthUser }>("/auth/username", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
  }

  requestPasswordReset(email: string) {
    return this.request<{ accepted: true; activationUrl?: string }>("/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  completePasswordReset(password: string) {
    return this.request<{ ok: true }>("/auth/password-reset/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  }

  requestAccountDeletion() {
    return this.request<{ accepted: true }>("/auth/account-deletion", { method: "POST" });
  }

  accountDeletionStatus() {
    return this.request<{
      authorized: boolean;
      maskedEmail?: string;
      expiresAt?: number;
    }>("/auth/account-deletion/status", { cache: "no-store" });
  }

  completeAccountDeletion(confirmation: string) {
    return this.request<void>("/auth/account-deletion/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
  }

  resendActivationEmail(email: string) {
    return this.request<{ accepted: true; activationUrl?: string }>("/auth/email-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  syncProgress(progress: LocalProgress) {
    return this.request<{ progress: LocalProgress }>("/auth/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        playerId: progress.playerId,
        preferences: {
          reducedMotion: progress.preferences.reducedMotion,
          highContrast: progress.preferences.highContrast,
          hasSeenClassicPrivacy: progress.preferences.hasSeenClassicPrivacy,
          hasSeenClassicHowToPlay: progress.preferences.hasSeenClassicHowToPlay ?? false,
          innerCircleActive: progress.preferences.innerCircleActive,
          hellMode: progress.preferences.hellMode,
          hasAutoplayedHardcoreSoundtrack: progress.preferences.hasAutoplayedHardcoreSoundtrack,
        },
        activeGames: Object.values(progress.games)
          .filter((game) => game.status === "in-progress")
          .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
          .slice(0, 16)
          .map((game) => ({ challengeId: game.challengeId, startedAt: game.startedAt })),
      }),
    });
  }

  cloudProgress() {
    return this.request<{ progress: LocalProgress | null }>("/auth/progress", {
      cache: "no-store",
    });
  }

  progressHistory(game: "classic" | "emoji" | "timeline", category: string, page: number) {
    const query = new URLSearchParams({ game, category, page: String(page) });
    return this.request<ProgressHistory>(`/auth/progress/history?${query}`, {
      cache: "no-store",
    });
  }

  enableHardcoreAccess() {
    return this.request<{ unlocked: true }>("/games/classic/hardcore/access", { method: "POST" });
  }

  hardcoreStatus() {
    return this.request<HardcoreStatus>("/auth/hardcore-status", { cache: "no-store" });
  }

  reportIssue(title: string, description: string, game: "classic" | "emoji" | "timeline" | "logo") {
    return this.request<{ url: string }>("/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, game }),
    });
  }

  adminUsers(page: number, query: string) {
    const search = new URLSearchParams({ page: String(page) });
    if (query) search.set("query", query);
    return this.request<{
      users: AdminUserSummary[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/admin/users?${search}`, { cache: "no-store" });
  }

  adminUser(userId: string) {
    return this.request<{ user: AdminUserDetail }>(`/admin/users/${encodeURIComponent(userId)}`, {
      cache: "no-store",
    });
  }

  updateAdminUser(
    userId: string,
    update: {
      permission?: Extract<UserPermission, "user" | "developer">;
      disabled?: boolean;
      disabledReason?: string;
      issueReportLimit?: number;
    },
  ) {
    return this.request<{ user: AdminUserDetail }>(`/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
  }

  removeAdminGameGuess(userId: string, gameKey: string, requestId: string) {
    return this.request<{ user: AdminUserDetail }>(`/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameKey, requestId }),
    });
  }

  hardcoreSoundtrackSetting() {
    return this.request<{ url: string }>("/admin/settings/hardcore-soundtrack", {
      cache: "no-store",
    });
  }

  updateHardcoreSoundtrack(url: string) {
    return this.request<{ url: string }>("/admin/settings/hardcore-soundtrack", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  }

  publicConfig() {
    return this.request<{ hardcoreSoundtrackUrl: string | null }>("/public-config", {
      cache: "no-store",
    });
  }

  classicGame(category: ClassicCategory, difficulty: ClassicDifficulty, signal?: AbortSignal) {
    const path =
      category === "hardcore"
        ? "/games/classic/hardcore"
        : `/games/classic/${category}/${difficulty}`;
    return this.request<V2ClassicGame>(path, { signal }).then((payload) => ({
      challenge: {
        ...payload.challenge,
        mode: { category, difficulty },
        columns: payload.columns as PublicDailyChallengeDto["columns"],
      },
      models: payload.models.map((model) => ({ ...model, familyName: model.familyName ?? "" })),
      columns: payload.columns,
      globalCompletionCount: payload.globalCompletionCount,
    }));
  }

  submitClassicGuess(
    challengeId: string,
    playerId: string,
    requestId: string,
    guessedModelId: string,
    attemptNumber: number,
  ) {
    return this.request<V2ClassicGuess>(`/games/classic/challenges/${challengeId}/guesses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, requestId, guessedModelId, attemptNumber }),
    }).then((payload) => ({
      guess: {
        isCorrect: payload.isCorrect,
        sameGuessCount: 1,
        matchingFamily: payload.matchingFamily,
        matchingCategories: payload.matchingCategories,
        matchingInputModalities: payload.matchingInputModalities,
        matchingOutputModalities: payload.matchingOutputModalities,
        matchingUseCases: payload.matchingUseCases,
        model: toComparableModel(payload.guessedModel),
        comparison: payload.comparison,
      },
      trajectoryAccessToken: payload.trajectoryAccessToken ?? null,
      globalCompletionCount: payload.globalCompletionCount,
    }));
  }

  classicGuessHistory(challengeId: string, playerId: string) {
    const query = new URLSearchParams({ playerId });
    return this.request<{ guesses: V2ClassicGuessHistoryEntry[] }>(
      `/games/classic/challenges/${challengeId}/guesses?${query}`,
      { cache: "no-store" },
    ).then(({ guesses }) =>
      guesses.map((guess) => ({
        requestId: guess.requestId,
        attemptedAt: new Date(guess.attemptedAt).toISOString(),
        attemptNumber: guess.attemptNumber,
        isCorrect: guess.isCorrect,
        matchingFamily: guess.matchingFamily,
        matchingCategories: guess.matchingCategories,
        matchingInputModalities: guess.matchingInputModalities,
        matchingOutputModalities: guess.matchingOutputModalities,
        matchingUseCases: guess.matchingUseCases,
        model: toComparableModel(guess.guessedModel),
        comparison: guess.comparison,
      })),
    );
  }

  classicStats(challengeId: string) {
    return this.request<{
      challengeId: string;
      totalGuesses: number;
      uniquePlayers: number;
      correctGuesses: number;
    }>(`/games/classic/challenges/${challengeId}/stats`);
  }

  timelineGame(difficulty: TimelineDifficulty, playerId: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ playerId });
    return this.request<TimelineGamePayload>(`/games/timeline/${difficulty}?${query}`, {
      cache: "no-store",
      signal,
    });
  }

  startTimelineSpeedrun(challengeId: string, playerId: string) {
    return this.request<TimelineSpeedrunStartPayload>(
      `/games/timeline/challenges/${challengeId}/start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      },
    );
  }

  timelineLeaderboard(challengeId: string) {
    return this.request<TimelineLeaderboardPayload>(
      `/games/timeline/challenges/${challengeId}/leaderboard`,
      { cache: "no-store" },
    );
  }

  currentTimelineLeaderboard() {
    return this.request<TimelineLeaderboardPayload>("/games/timeline/leaderboard", {
      cache: "no-store",
    });
  }

  datedTimelineLeaderboard(date: string) {
    return this.request<TimelineLeaderboardPayload>(`/games/timeline/leaderboard/${date}`, {
      cache: "no-store",
    });
  }

  globalTimelineLeaderboard() {
    return this.request<TimelineGlobalLeaderboardPayload>("/games/timeline/leaderboard/global", {
      cache: "no-store",
    });
  }

  submitTimelineAttempt(
    challengeId: string,
    playerId: string,
    requestId: string,
    modelOrder: string[],
  ) {
    return this.request<TimelineAttemptPayload>(
      `/games/timeline/challenges/${challengeId}/attempts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, requestId, modelOrder }),
      },
    );
  }

  emojiGame(difficulty: EmojiDifficulty, signal?: AbortSignal) {
    return this.request<EmojiGamePayload>(`/games/emoji/${difficulty}`, { signal });
  }

  submitEmojiGuess(
    challengeId: string,
    playerId: string,
    requestId: string,
    guessedEntityId: string,
    attemptNumber: number,
  ) {
    return this.request<{
      entity: EmojiGamePayload["entities"][number];
      isCorrect: boolean;
      attemptNumber: number;
      globalCompletionCount: number;
      clues: VisualClue[];
    }>(`/games/emoji/challenges/${challengeId}/guesses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, requestId, guessedEntityId, attemptNumber }),
    });
  }

  emojiHints(challengeId: string, playerId: string) {
    const query = new URLSearchParams({ playerId });
    return this.request<{ clues: VisualClue[] }>(
      `/games/emoji/challenges/${challengeId}/hints?${query}`,
      { cache: "no-store" },
    );
  }

  emojiGuessHistory(challengeId: string, playerId: string) {
    const query = new URLSearchParams({ playerId });
    return this.request<{
      guesses: Array<{ id: string; name: string; isCorrect: boolean; attemptNumber: number }>;
      clues: VisualClue[];
    }>(`/games/emoji/challenges/${challengeId}/guesses?${query}`, { cache: "no-store" });
  }

  classicTrajectory(challengeId: string, trajectoryAccessToken?: string, signal?: AbortSignal) {
    return this.request<{ models: PublicGuessedModel[] }>(
      `/games/classic/challenges/${challengeId}/trajectory`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trajectoryAccessToken }),
        signal,
      },
    ).then(({ models }) => ({ models: models.map((model) => toComparableModel(model)) }));
  }
}

export const apiClient = new ApiClient();
