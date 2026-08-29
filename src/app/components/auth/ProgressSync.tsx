"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@lib/api/client";
import { useLocalProgress, useLocalProgressReady } from "@lib/storage/use-local-progress";
import {
  getSnapshot,
  replaceProgress,
  startCloudProgress,
} from "@lib/storage/local-progress-store";
import { mergeServerProgress } from "@lib/domain/players/cloud-progress";
import { useAuth } from "./useAuth";

export function ProgressSync() {
  const { user } = useAuth();

  if (!user || user.disabled) return null;

  return <AuthenticatedProgressSync key={user.id} />;
}

function AuthenticatedProgressSync() {
  const progress = useLocalProgress();
  const ready = useLocalProgressReady();
  const lastSynced = useRef<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!ready || cloudReady) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    const localProgress = getSnapshot();
    void apiClient
      .syncProgress(localProgress)
      .then(({ progress: cloudProgress }) => {
        if (cancelled) return;
        const acknowledgedProgress = mergeServerProgress(cloudProgress, localProgress);
        const currentProgress = getSnapshot();
        const requestWasSuperseded =
          JSON.stringify(currentProgress) !== JSON.stringify(localProgress);
        const nextProgress = requestWasSuperseded ? currentProgress : acknowledgedProgress;

        replaceProgress(nextProgress);
        startCloudProgress();
        lastSynced.current = JSON.stringify(acknowledgedProgress);
        setCloudReady(true);
      })
      .catch(() => {
        if (!cancelled && retry < 2) {
          retryTimer = window.setTimeout(() => setRetry((value) => value + 1), 2_000);
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [cloudReady, ready, retry]);

  useEffect(() => {
    if (!ready || !cloudReady) return;

    const serialized = JSON.stringify(progress);
    if (serialized === lastSynced.current) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    const syncTimer = window.setTimeout(() => {
      void apiClient
        .syncProgress(progress)
        .then(({ progress: synced }) => {
          if (cancelled) return;
          const merged = mergeServerProgress(synced, getSnapshot());
          const syncedSerialized = JSON.stringify(merged);
          lastSynced.current = syncedSerialized;
          if (syncedSerialized !== serialized) replaceProgress(merged);
        })
        .catch(() => {
          if (!cancelled && retry < 2) {
            retryTimer = window.setTimeout(() => setRetry((value) => value + 1), 2_000);
          }
        });
    }, 750);

    return () => {
      cancelled = true;
      window.clearTimeout(syncTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [cloudReady, progress, ready, retry]);

  return null;
}
