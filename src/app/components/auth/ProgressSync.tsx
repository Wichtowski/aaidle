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

export function ProgressSync() {
  const { user } = useAuth();

  if (!user || user.disabled) return null;

  return <AuthenticatedProgressSync key={user.id} userId={user.id} />;
}

function AuthenticatedProgressSync({ userId }: { userId: string }) {
  const progress = useLocalProgress();
  const ready = useLocalProgressReady();
  const lastSyncedPreferences = useRef<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [reconciliationRetry, setReconciliationRetry] = useState(0);
  const [preferencesRetry, setPreferencesRetry] = useState(0);

  useEffect(() => {
    if (!ready || cloudReady) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    prepareCloudProgress(userId);
    const localProgress = getSnapshot();
    void apiClient
      .syncProgress(localProgress)
      .then(({ progress: cloudProgress }) => {
        if (cancelled) return;
        const currentProgress = getSnapshot();
        const nextProgress = mergeServerProgress(cloudProgress, currentProgress);

        replaceProgress(nextProgress);
        const cachedProgress = startCloudProgress(userId);
        lastSyncedPreferences.current = JSON.stringify(cachedProgress.preferences);
        setCloudReady(true);
      })
      .catch(() => {
        if (!cancelled && reconciliationRetry < 2) {
          retryTimer = window.setTimeout(() => setReconciliationRetry((value) => value + 1), 2_000);
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [cloudReady, ready, reconciliationRetry, userId]);

  useEffect(() => {
    if (!ready || !cloudReady) return;

    const serialized = JSON.stringify(progress.preferences);
    if (serialized === lastSyncedPreferences.current) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    const updateTimer = window.setTimeout(() => {
      void apiClient
        .updateProgressPreferences(progress.preferences)
        .then(() => {
          if (cancelled) return;
          lastSyncedPreferences.current = serialized;
          setPreferencesRetry(0);
        })
        .catch(() => {
          if (!cancelled && preferencesRetry < 2) {
            retryTimer = window.setTimeout(() => setPreferencesRetry((value) => value + 1), 2_000);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(updateTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [
    cloudReady,
    preferencesRetry,
    progress.preferences.hasAutoplayedHardcoreSoundtrack,
    progress.preferences.hasSeenClassicHowToPlay,
    progress.preferences.hellMode,
    progress.preferences.innerCircleActive,
    ready,
  ]);

  return null;
}
