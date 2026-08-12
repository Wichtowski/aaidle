import type { PublicDailyChallengeDto } from "../domain/challenges/challenge-types";
import type { ClassicComparison } from "../domain/guesses/comparison-types";
import type { ComparableModel, ClassicCategory, ClassicDifficulty, PublicModelIndex } from "../domain/models/model-types";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type ClassicGamePayload = {
  challenge: PublicDailyChallengeDto;
  models: PublicModelIndex[];
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
};

type ApiErrorPayload = { error?: { message?: string } };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

class ApiClient {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const payload = (response.status === 204 ? undefined : await response.json()) as T & ApiErrorPayload;
    if (!response.ok) throw new ApiError(payload.error?.message ?? "Request failed.", response.status);
    return payload;
  }

  async currentUser(): Promise<AuthUser | null> {
    return (await this.request<{ user: AuthUser | null }>("/api/v1/auth/me", { cache: "no-store" })).user;
  }

  signOut() {
    return this.request<void>("/api/v1/auth/logout", { method: "POST" });
  }

  signInWithPassword(email: string, password: string) {
    return this.authenticate("password", email, password);
  }

  register(email: string, password: string) {
    return this.authenticate("register", email, password);
  }

  private authenticate(path: "password" | "register", email: string, password: string) {
    return this.request<{ user: AuthUser }>(`/api/v1/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }

  classicGame(category: ClassicCategory, difficulty: ClassicDifficulty, signal?: AbortSignal) {
    return this.request<ClassicGamePayload>(`/api/v1/games/classic/${category}/${difficulty}`, { signal });
  }

  submitClassicGuess(challengeId: string, guessedModelId: string, attemptNumber: number) {
    return this.request<ClassicGuessPayload>(`/api/v1/games/classic/challenges/${challengeId}/guesses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guessedModelId, attemptNumber }),
    });
  }
}

export const apiClient = new ApiClient();
