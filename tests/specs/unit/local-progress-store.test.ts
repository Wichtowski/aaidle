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
  });

  it("clears browser progress and keeps authenticated updates out of local storage", async () => {
    const store = await import("../../../src/lib/storage/local-progress-store");
    window.localStorage.removeItem(store.progressKey);
    window.localStorage.removeItem(store.playerIdKey);
    const localProgress = store.freshProgress();
    window.localStorage.setItem(store.progressKey, JSON.stringify(localProgress));

    store.initialiseProgress();
    store.startCloudProgress();
    store.updateProgress((progress) => ({
      ...progress,
      preferences: { ...progress.preferences, hellMode: true },
    }));

    expect(window.localStorage.getItem(store.progressKey)).toBeNull();
    expect(window.localStorage.getItem(store.playerIdKey)).toBeNull();
    expect(store.getSnapshot().preferences.hellMode).toBe(true);
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
