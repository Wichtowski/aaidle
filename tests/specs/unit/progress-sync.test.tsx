// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshProgress } from "../../../src/lib/storage/local-progress-store";

const mocks = vi.hoisted(() => ({
  progress: null as ReturnType<typeof freshProgress> | null,
  syncProgress: vi.fn(),
  cloudProgress: vi.fn(),
  updateProgressPreferences: vi.fn(),
  replaceProgress: vi.fn(),
  prepareCloudProgress: vi.fn(),
  startCloudProgress: vi.fn(),
}));

vi.mock("../../../src/app/components/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", disabled: false } }),
}));

vi.mock("../../../src/lib/api/client", () => ({
  apiClient: {
    syncProgress: mocks.syncProgress,
    cloudProgress: mocks.cloudProgress,
    updateProgressPreferences: mocks.updateProgressPreferences,
  },
}));

vi.mock("../../../src/lib/storage/use-local-progress", () => ({
  useLocalProgress: () => mocks.progress,
  useLocalProgressReady: () => true,
}));

vi.mock("../../../src/lib/storage/local-progress-store", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../src/lib/storage/local-progress-store")>();
  return {
    ...original,
    getSnapshot: () => mocks.progress,
    prepareCloudProgress: mocks.prepareCloudProgress,
    replaceProgress: mocks.replaceProgress,
    startCloudProgress: mocks.startCloudProgress,
  };
});

vi.mock("../../../src/lib/domain/players/cloud-progress", () => ({
  mergeServerProgress: (_server: unknown, progress: ReturnType<typeof freshProgress>) => progress,
}));

import { ProgressSync } from "../../../src/app/components/auth/ProgressSync";

describe("progress reconciliation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });
    mocks.progress = freshProgress();
    mocks.syncProgress.mockReset().mockResolvedValue({ progress: {} });
    mocks.cloudProgress.mockReset().mockResolvedValue({ progress: {} });
    mocks.updateProgressPreferences.mockReset().mockResolvedValue(undefined);
    mocks.replaceProgress.mockReset();
    mocks.prepareCloudProgress.mockReset().mockReturnValue({ source: "reconciliation" });
    mocks.startCloudProgress.mockReset().mockImplementation(() => mocks.progress);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconciles once and ignores game-only progress changes", async () => {
    const view = render(<ProgressSync />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.syncProgress).toHaveBeenCalledTimes(1);
    expect(mocks.startCloudProgress).toHaveBeenCalledTimes(1);

    mocks.progress = {
      ...mocks.progress!,
      games: {
        game: {
          challengeId: crypto.randomUUID(),
          challengeDate: "2026-08-31",
          mode: "classic:llm:normal",
          status: "in-progress",
          guesses: [],
          startedAt: "2026-08-31T12:00:00.000Z",
          completedAt: null,
        },
      },
    };
    view.rerender(<ProgressSync />);
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.syncProgress).toHaveBeenCalledTimes(1);
    expect(mocks.updateProgressPreferences).not.toHaveBeenCalled();

    mocks.progress = {
      ...mocks.progress,
      preferences: { ...mocks.progress.preferences, hasSeenClassicHowToPlay: true },
    };
    view.rerender(<ProgressSync />);
    await act(async () => vi.advanceTimersByTime(300));

    expect(mocks.updateProgressPreferences).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate or retry a failed reconciliation", async () => {
    mocks.syncProgress.mockRejectedValue(new Error("server failed"));

    render(
      <StrictMode>
        <ProgressSync />
      </StrictMode>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(mocks.syncProgress).toHaveBeenCalledTimes(1);
  });

  it("resumes the tab cache without reconciling again", async () => {
    mocks.prepareCloudProgress.mockReturnValue({ source: "cache", progress: mocks.progress });

    render(<ProgressSync />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.syncProgress).not.toHaveBeenCalled();
    expect(mocks.startCloudProgress).toHaveBeenCalledTimes(1);
    expect(mocks.updateProgressPreferences).not.toHaveBeenCalled();
  });

  it("loads compact server progress instead of reconciling again in another tab", async () => {
    mocks.prepareCloudProgress.mockReturnValue({ source: "server" });

    render(<ProgressSync />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.cloudProgress).toHaveBeenCalledTimes(1);
    expect(mocks.syncProgress).not.toHaveBeenCalled();
    expect(mocks.startCloudProgress).toHaveBeenCalledTimes(1);
  });

  it("reconciles when another tab has no compact server progress", async () => {
    mocks.prepareCloudProgress.mockReturnValue({ source: "server" });
    mocks.cloudProgress.mockResolvedValue({ progress: undefined });

    render(<ProgressSync />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.cloudProgress).toHaveBeenCalledTimes(1);
    expect(mocks.syncProgress).toHaveBeenCalledTimes(1);
    expect(mocks.replaceProgress).toHaveBeenCalledTimes(1);
  });

  it("retries a failed preference update up to the retry limit", async () => {
    mocks.updateProgressPreferences
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(undefined);
    const view = render(<ProgressSync />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    mocks.progress = {
      ...mocks.progress!,
      preferences: { ...mocks.progress!.preferences, hellMode: true },
    };
    view.rerender(<ProgressSync />);

    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(mocks.updateProgressPreferences).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.updateProgressPreferences).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.updateProgressPreferences).toHaveBeenCalledTimes(3);
  });

  it("serializes preference writes so an older request cannot overwrite a newer one", async () => {
    let resolveFirstRequest: (() => void) | undefined;
    mocks.updateProgressPreferences
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstRequest = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const view = render(<ProgressSync />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    mocks.progress = {
      ...mocks.progress!,
      preferences: { ...mocks.progress!.preferences, hasSeenClassicHowToPlay: true },
    };
    view.rerender(<ProgressSync />);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(mocks.updateProgressPreferences).toHaveBeenCalledTimes(1);

    mocks.progress = {
      ...mocks.progress,
      preferences: { ...mocks.progress.preferences, hellMode: true },
    };
    view.rerender(<ProgressSync />);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(mocks.updateProgressPreferences).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstRequest?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.updateProgressPreferences).toHaveBeenCalledTimes(2);
    expect(mocks.updateProgressPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ hasSeenClassicHowToPlay: true, hellMode: true }),
    );
  });
});
