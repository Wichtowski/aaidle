"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@lib/api/client";
import { useLocalProgress, useLocalProgressReady } from "@lib/storage/use-local-progress";
import {
  getSnapshot,
  prepareCloudProgress,
  replaceProgress,
  startCloudProgress,
} from "@lib/storage/local-progress-store";
import { mergeServerProgress } from "@lib/domain/players/cloud-progress";
import { useAuth } from "./useAuth";

const preferenceRetryDelayMs = 2_000;
const preferenceRetryCount = 2;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function ProgressSync() {
  const { user } = useAuth();

  if (!user || user.disabled) return null;

  return <AuthenticatedProgressSync key={user.id} userId={user.id} />;
}

function AuthenticatedProgressSync({ userId }: { userId: string }) {
  const progress = useLocalProgress();
  const ready = useLocalProgressReady();
  const lastSyncedPreferences = useRef<string | null>(null);
  const preferenceQueue = useRef(Promise.resolve());
  const preferenceGeneration = useRef(0);
  const [cloudReady, setCloudReady] = useState(false);
  const reconciliationAttempted = useRef(false);

  useEffect(
    () => () => {
      preferenceGeneration.current += 1;
    },
    [userId],
  );

  useEffect(() => {
    if (!ready || cloudReady || reconciliationAttempted.current) return;

    reconciliationAttempted.current = true;

    let cancelled = false;
    const preparation = prepareCloudProgress(userId);
    if (preparation.source === "cache") {
      const activeProgress = startCloudProgress(userId);
      lastSyncedPreferences.current = JSON.stringify(activeProgress.preferences);
      setCloudReady(true);
      return;
    }

    const localProgress = getSnapshot();
    const cloudProgress =
      preparation.source === "server"
        ? apiClient
            .cloudProgress()
            .then(({ progress: serverProgress }) =>
              serverProgress ? { progress: serverProgress } : apiClient.syncProgress(localProgress),
            )
        : apiClient.syncProgress(localProgress);
    void cloudProgress
      .then(({ progress: cloudProgress }) => {
        if (cancelled) return;
        const currentProgress = getSnapshot();
        const nextProgress = mergeServerProgress(cloudProgress, currentProgress);

        replaceProgress(nextProgress);
        const cachedProgress = startCloudProgress(userId);
        lastSyncedPreferences.current = JSON.stringify(cachedProgress.preferences);
        setCloudReady(true);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [cloudReady, ready, userId]);

  useEffect(() => {
    if (!ready || !cloudReady) return;

    const serialized = JSON.stringify(progress.preferences);
    if (serialized === lastSyncedPreferences.current) return;

    const generation = preferenceGeneration.current;
    const updateTimer = window.setTimeout(() => {
      preferenceQueue.current = preferenceQueue.current
        .catch(() => undefined)
        .then(async () => {
          for (let attempt = 0; attempt <= preferenceRetryCount; attempt += 1) {
            if (generation !== preferenceGeneration.current) return;

            try {
              await apiClient.updateProgressPreferences(progress.preferences);
              if (generation === preferenceGeneration.current) {
                lastSyncedPreferences.current = serialized;
              }
              return;
            } catch {
              if (attempt === preferenceRetryCount) return;
              await wait(preferenceRetryDelayMs);
            }
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(updateTimer);
    };
  }, [
    cloudReady,
    progress.preferences.hasAutoplayedHardcoreSoundtrack,
    progress.preferences.hasSeenClassicHowToPlay,
    progress.preferences.hellMode,
    progress.preferences.innerCircleActive,
    ready,
  ]);

  return null;
}
