"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../../lib/api/client";
import { useLocalProgress, useLocalProgressReady } from "../../../lib/storage/use-local-progress";
import { updateProgress } from "../../../lib/storage/local-progress-store";
import { useAuth } from "./useAuth";

export function ProgressSync() {
  const { user } = useAuth();
  const progress = useLocalProgress();
  const ready = useLocalProgressReady();
  const lastSynced = useRef<string | null>(null);
  const syncedUserId = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!ready || !user?.emailVerified) return;

    if (syncedUserId.current !== user.id) {
      syncedUserId.current = user.id;
      lastSynced.current = null;
    }

    const serialized = JSON.stringify(progress);
    if (serialized === lastSynced.current) return;

    let cancelled = false;
    void apiClient
      .syncProgress(progress)
      .then(({ progress: synced }) => {
        if (cancelled) return;
        const syncedSerialized = JSON.stringify(synced);
        lastSynced.current = syncedSerialized;
        if (syncedSerialized !== serialized) updateProgress(() => synced);
      })
      .catch(() => {
        if (!cancelled) window.setTimeout(() => setRetry((value) => value + 1), 30_000);
      });

    return () => {
      cancelled = true;
    };
  }, [progress, ready, retry, user?.emailVerified, user?.id]);

  return null;
}
