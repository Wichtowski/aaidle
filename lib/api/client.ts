import type { PublicDailyChallengeDto } from "../domain/challenges/challenge-types";
import type { ClassicComparison } from "../domain/guesses/comparison-types";
import type {
  ComparableModel,
  ClassicCategory,
  ClassicDifficulty,
  PublicModelIndex,
} from "../domain/models/model-types";
import type { LocalProgress } from "../storage/local-progress-schema";
import type { UserPermission } from "../auth/permissions";

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
  progress: unknown | null;
  trajectoryTargets: Record<string, ComparableModel>;
  trajectoryReferenceModels: ComparableModel[];
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
  globalCompletionCount: number | null;
};

type ApiErrorPayload = { error?: { code?: string; message?: string } };

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

class ApiClient {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const payload = (response.status === 204 ? undefined : await response.json()) as T &
      ApiErrorPayload;
    if (!response.ok) {
      throw new ApiError(
        payload.error?.message ?? "Request failed.",
        response.status,
        payload.error?.code,
      );
    }
    return payload;
  }

  async currentUser(): Promise<AuthUser | null> {
    return (await this.request<{ user: AuthUser | null }>("/api/v1/auth/me", { cache: "no-store" }))
      .user;
  }

  signOut() {
    return this.request<void>("/api/v1/auth/logout", { method: "POST" });
  }

  signInWithPassword(email: string, password: string) {
    return this.authenticate("password", email, password);
  }

  register(email: string, password: string) {
    return this.request<{ accepted: true; activationUrl?: string }>("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }

  requestPasswordReset(email: string) {
    return this.request<{ accepted: true; activationUrl?: string }>("/api/v1/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  requestAccountDeletion() {
    return this.request<{ accepted: true }>("/api/v1/auth/account-deletion", {
      method: "POST",
    });
  }

  resendActivationEmail(email: string) {
    return this.request<{ accepted: true; activationUrl?: string }>(
      "/api/v1/auth/email-verification",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      },
    );
  }

  syncProgress(progress: LocalProgress) {
    return this.request<{ progress: LocalProgress }>("/api/v1/auth/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    });
  }

  cloudProgress() {
    return this.request<{ progress: LocalProgress | null }>("/api/v1/auth/progress", {
      cache: "no-store",
    });
  }

  enableHardcoreAccess(progress: LocalProgress) {
    return this.request<{ unlocked: true }>("/api/v1/games/classic/hardcore/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    });
  }

  reportIssue(input: { title: string; description: string; page: string }) {
    return this.request<{ issueUrl: string }>("/api/v1/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
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
    }>(`/api/v1/admin/users?${search}`, { cache: "no-store" });
  }

  adminUser(userId: string) {
    return this.request<{ user: AdminUserDetail }>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        cache: "no-store",
      },
    );
  }

  updateAdminUser(
    userId: string,
    update: {
      permission?: Extract<UserPermission, "user" | "developer">;
      disabled?: boolean;
      disabledReason?: string;
    },
  ) {
    return this.request<{ user: AdminUserDetail }>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      },
    );
  }

  hardcoreSoundtrackSetting() {
    return this.request<{ url: string }>("/api/v1/admin/settings/hardcore-soundtrack", {
      cache: "no-store",
    });
  }

  updateHardcoreSoundtrack(url: string) {
    return this.request<{ url: string }>("/api/v1/admin/settings/hardcore-soundtrack", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  }

  private authenticate(path: "password" | "register", email: string, password: string) {
    return this.request<{ user: AuthUser }>(`/api/v1/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }

  classicGame(category: ClassicCategory, difficulty: ClassicDifficulty, signal?: AbortSignal) {
    return this.request<ClassicGamePayload>(`/api/v1/games/classic/${category}/${difficulty}`, {
      signal,
    });
  }

  submitClassicGuess(challengeId: string, guessedModelId: string, attemptNumber: number) {
    return this.request<ClassicGuessPayload>(
      `/api/v1/games/classic/challenges/${challengeId}/guesses`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guessedModelId, attemptNumber }),
      },
    );
  }
}

export const apiClient = new ApiClient();
