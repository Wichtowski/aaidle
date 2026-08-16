import type { UserPermission } from "../auth/permissions";
import type { PublicDailyChallengeDto } from "../domain/challenges/challenge-types";
import type { ClassicComparison } from "../domain/guesses/comparison-types";
import type {
  ClassicCategory,
  ClassicDifficulty,
  ComparableModel,
  PublicModelIndex,
} from "../domain/models/model-types";
import type { LocalProgress } from "../storage/local-progress-schema";

const apiPath = (path: string) => `/api/v2${path}`;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  permission: UserPermission;
  disabled: boolean;
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

export type EmojiGamePayload = {
  challenge: {
    id: string;
    date: string;
    mode: "emoji";
    expiresAt: string;
    initialEmoji: string[];
    maximumEmoji: number;
  };
  families: Array<{
    id: string;
    name: string;
    providerName: string;
    representativeModelId: string;
  }>;
  globalCompletionCount: number;
};

export type EmojiGuessPayload = {
  guess: {
    family: { id: string; name: string; providerName: string };
    isCorrect: boolean;
    attemptNumber: number;
  };
  globalCompletionCount: number | null;
  emoji: string[];
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
  guessedModel: { id: string; name: string; provider: string | null; family: string | null };
  comparison: ClassicComparison;
  isCorrect: boolean;
  globalCompletionCount: number;
  trajectoryAccessToken?: string;
};

type V2EmojiGuess = {
  family: { id: string; name: string; providerName: string };
  isCorrect: boolean;
  attemptNumber: number;
  globalCompletionCount: number;
  emoji: string[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message = "The service could not be reached. Check your connection and retry.") {
    super(message);
    this.name = "NetworkError";
  }
}

export function isApiUnavailable(error: unknown) {
  return error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
}

const toComparableModel = (model: V2ClassicGuess["guessedModel"]): ComparableModel => ({
  id: model.id,
  name: model.name,
  provider: model.provider,
  country: null,
  family: model.family,
  categories: null,
  inputModalities: null,
  outputModalities: null,
  useCases: null,
  reasoningSupport: null,
  weightAvailability: null,
  categoryDetails: {},
  releaseYear: null,
  releaseDate: null,
  contextWindowTokens: null,
});

class ApiClient {
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(apiPath(path), {
        ...init,
        credentials: "include",
        headers: { Accept: "application/json", ...init.headers },
      });
    } catch {
      throw new NetworkError();
    }

    const payload = (response.status === 204 ? undefined : await response.json().catch(() => null)) as
      | (T & ApiErrorPayload)
      | null;
    if (!response.ok) {
      throw new ApiError(
        payload?.error?.message ?? "Request failed. Please try again.",
        response.status,
        payload?.error?.code,
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

  register(email: string, password: string) {
    return this.request<{ accepted: true; activationUrl?: string }>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
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
    return this.request<{ user: AuthUser }>("/auth/password-reset/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  }

  requestAccountDeletion() {
    return this.request<{ accepted: true }>("/auth/account-deletion", { method: "POST" });
  }

  completeAccountDeletion() {
    return this.request<void>("/auth/account-deletion/complete", { method: "POST" });
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
      body: JSON.stringify(progress),
    });
  }

  cloudProgress() {
    return this.request<{ progress: LocalProgress | null }>("/auth/progress", { cache: "no-store" });
  }

  enableHardcoreAccess() {
    return this.request<{ unlocked: true }>("/games/classic/hardcore/access", { method: "POST" });
  }

  reportIssue() {
    throw new ApiError("Issue reporting is temporarily unavailable while its v2 API is completed.", 501);
  }

  adminUsers(page: number, query: string) {
    const search = new URLSearchParams({ page: String(page) });
    if (query) search.set("query", query);
    return this.request<{ users: AdminUserSummary[]; total: number; page: number; pageSize: number }>(
      `/admin/users?${search}`,
      { cache: "no-store" },
    );
  }

  adminUser(userId: string) {
    return this.request<{ user: AdminUserDetail }>(`/admin/users/${encodeURIComponent(userId)}`, {
      cache: "no-store",
    });
  }

  updateAdminUser(
    userId: string,
    update: { permission?: Extract<UserPermission, "user" | "developer">; disabled?: boolean; disabledReason?: string },
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
    return this.request<{ url: string }>("/admin/settings/hardcore-soundtrack", { cache: "no-store" });
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
    const path = category === "hardcore" ? "/games/classic/hardcore" : `/games/classic/${category}/${difficulty}`;
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
        matchingCategories: [],
        matchingInputModalities: [],
        matchingOutputModalities: [],
        matchingUseCases: [],
        model: toComparableModel(payload.guessedModel),
        comparison: payload.comparison,
      },
      trajectoryAccessToken: payload.trajectoryAccessToken ?? null,
      globalCompletionCount: payload.globalCompletionCount,
    }));
  }

  classicStats(challengeId: string) {
    return this.request<{ challengeId: string; totalGuesses: number; uniquePlayers: number; correctGuesses: number }>(
      `/games/classic/challenges/${challengeId}/stats`,
    );
  }

  emojiGame(signal?: AbortSignal) {
    return this.request<EmojiGamePayload>("/games/emoji", { signal });
  }

  submitEmojiGuess(
    challengeId: string,
    playerId: string,
    requestId: string,
    guessedFamilyId: string,
    attemptNumber: number,
  ) {
    return this.request<V2EmojiGuess>(`/games/emoji/challenges/${challengeId}/guesses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, requestId, guessedFamilyId, attemptNumber }),
    }).then((payload) => ({
      guess: { family: payload.family, isCorrect: payload.isCorrect, attemptNumber: payload.attemptNumber },
      globalCompletionCount: payload.globalCompletionCount,
      emoji: payload.emoji,
    }));
  }

  emojiHints(challengeId: string, playerId: string) {
    const query = new URLSearchParams({ playerId });
    return this.request<{ emoji: string[] }>(`/games/emoji/challenges/${challengeId}/hints?${query}`, {
      cache: "no-store",
    });
  }

  classicTrajectory(challengeId: string, trajectoryAccessToken?: string, signal?: AbortSignal) {
    return this.request<{ models: PublicModel[] }>(`/games/classic/challenges/${challengeId}/trajectory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trajectoryAccessToken }),
      signal,
    }).then(({ models }) => ({
      models: models.map((model) => toComparableModel({
        id: model.id,
        name: model.name,
        provider: model.providerName,
        family: model.familyName,
      })),
    }));
  }
}

export const apiClient = new ApiClient();
