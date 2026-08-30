// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("local progress storage", () => {
  beforeEach(() => {
    vi.resetModules();
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const sessionValues = new Map<string, string>();
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => sessionValues.get(key) ?? null,
        setItem: (key: string, value: string) => sessionValues.set(key, value),
        removeItem: (key: string) => sessionValues.delete(key),
      },
    });
  });

  it("keeps authenticated progress in a tab-scoped UI cache", async () => {
    const store = await import("../../../src/lib/storage/local-progress-store");
    window.localStorage.removeItem(store.progressKey);
    window.localStorage.removeItem(store.playerIdKey);
    const localProgress = store.freshProgress();
    window.localStorage.setItem(store.progressKey, JSON.stringify(localProgress));

    store.initialiseProgress();
    store.startCloudProgress("user-1");
    store.updateProgress((progress) => ({
      ...progress,
      preferences: { ...progress.preferences, hellMode: true },
    }));

    expect(window.localStorage.getItem(store.progressKey)).toBeNull();
    expect(window.localStorage.getItem(store.playerIdKey)).toBeNull();
    expect(window.sessionStorage.getItem(store.authenticatedProgressKey)).not.toBeNull();
    expect(store.getSnapshot().preferences.hellMode).toBe(true);
  });

  it("resumes a matching tab cache without another reconciliation", async () => {
    const store = await import("../../../src/lib/storage/local-progress-store");
    const cachedProgress = store.freshProgress();
    cachedProgress.preferences.hasSeenClassicHowToPlay = true;
    window.sessionStorage.setItem(
      store.authenticatedProgressKey,
      JSON.stringify({ userId: "user-1", progress: cachedProgress }),
    );

    store.initialiseProgress();

    expect(store.prepareCloudProgress("user-1")).toEqual({
      source: "cache",
      progress: cachedProgress,
    });
    expect(store.getSnapshot()).toEqual(cachedProgress);
  });

  it("loads compact server progress for a known user in a new tab", async () => {
    const store = await import("../../../src/lib/storage/local-progress-store");
    window.localStorage.setItem(store.authenticatedUserKey, "user-1");
    store.initialiseProgress();

    expect(store.prepareCloudProgress("user-1")).toEqual({ source: "server" });
  });

  it("stores bounded game summaries instead of full authenticated guess history", async () => {
    const store = await import("../../../src/lib/storage/local-progress-store");
    const progress = store.freshProgress();
    progress.games.game = {
      challengeId: crypto.randomUUID(),
      challengeDate: "2026-08-31",
      mode: "classic:llm:normal",
      status: "in-progress",
      guesses: [
        {
          requestId: crypto.randomUUID(),
          modelId: "private-model-id",
          modelName: "Model",
          attemptedAt: "2026-08-31T12:00:00.000Z",
          attemptNumber: 1,
          isCorrect: false,
          sameGuessCount: 1,
          matchingFamily: [],
          matchingCategories: [],
          matchingInputModalities: [],
          matchingOutputModalities: [],
          matchingUseCases: [],
          model: { large: "payload" },
          comparison: {},
        },
      ],
      startedAt: "2026-08-31T12:00:00.000Z",
      completedAt: null,
    };

    store.initialiseProgress();
    store.replaceProgress(progress);
    store.startCloudProgress("user-1");

    const cached = JSON.parse(window.sessionStorage.getItem(store.authenticatedProgressKey) ?? "");
    expect(cached.progress.games.game.guesses).toEqual([]);
    expect(window.sessionStorage.getItem(store.authenticatedProgressKey)).not.toContain(
      "private-model-id",
    );
    expect(store.getSnapshot().games.game.guesses).toHaveLength(1);
  });

  it("keeps progress usable when the authenticated cache is full", async () => {
    const store = await import("../../../src/lib/storage/local-progress-store");
    store.initialiseProgress();
    store.startCloudProgress("user-1");
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() =>
      store.updateProgress((progress) => ({
        ...progress,
        preferences: { ...progress.preferences, hellMode: true },
      })),
    ).not.toThrow();
    expect(store.getSnapshot().preferences.hellMode).toBe(true);
  });

  it("starts a fresh anonymous cache after sign out", async () => {
    const store = await import("../../../src/lib/storage/local-progress-store");
    const authenticatedProgress = store.freshProgress();
    store.initialiseProgress();
    store.replaceProgress(authenticatedProgress);
    store.startCloudProgress("user-1");

    store.resetProgressAfterSignOut();

    expect(store.getSnapshot().playerId).not.toBe(authenticatedProgress.playerId);
    expect(store.getSnapshot().games).toEqual({});
    expect(window.localStorage.getItem(store.progressKey)).not.toBeNull();
    expect(window.sessionStorage.getItem(store.authenticatedProgressKey)).toBeNull();
  });

  it("keeps permanent Inner Circle state outside disposable progress", async () => {
    const store = await import("../../../src/lib/storage/local-progress-store");
    const progress = store.freshProgress();
    progress.preferences.hardcoreUnlocked = true;
    progress.preferences.hellMode = true;
    progress.preferences.hasAutoplayedHardcoreSoundtrack = true;

    store.updateProgress(() => progress);
    window.localStorage.removeItem(store.progressKey);
    window.localStorage.removeItem(store.playerIdKey);

    const resetProgress = store.readProgress();
    expect(resetProgress.preferences.hardcoreUnlocked).toBe(true);
    expect(resetProgress.preferences.hellMode).toBe(true);
    expect(resetProgress.preferences.hasAutoplayedHardcoreSoundtrack).toBe(true);
  });

  it("migrates the previous Classic modal preference without showing it again", async () => {
    const store = await import("../../../src/lib/storage/local-progress-store");
    const previousProgress = store.freshProgress();
    previousProgress.preferences.hasSeenClassicPrivacy = true;
    delete (previousProgress.preferences as Partial<typeof previousProgress.preferences>)
      .hasSeenClassicHowToPlay;

    window.localStorage.setItem(store.progressKey, JSON.stringify(previousProgress));

    expect(store.readProgress().preferences.hasSeenClassicHowToPlay).toBe(true);
  });
});
