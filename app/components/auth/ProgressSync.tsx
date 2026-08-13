"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../../lib/api/client";
import { useLocalProgress, useLocalProgressReady } from "../../../lib/storage/use-local-progress";
import { updateProgress } from "../../../lib/storage/local-progress-store";
import { useAuth } from "./useAuth";

export function ProgressSync() {
  const { user } = useAuth();

  if (!user?.emailVerified) return null;

  return <AuthenticatedProgressSync key={user.id} />;
}

function AuthenticatedProgressSync() {
  const progress = useLocalProgress();
  const ready = useLocalProgressReady();
  const lastSynced = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!ready) return;

    const serialized = JSON.stringify(progress);
    if (serialized === lastSynced.current) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    const syncTimer = window.setTimeout(() => {
      void apiClient
        .syncProgress(progress)
        .then(({ progress: synced }) => {
          if (cancelled) return;
          const syncedSerialized = JSON.stringify(synced);
          lastSynced.current = syncedSerialized;
          if (syncedSerialized !== serialized) updateProgress(() => synced);
        })
        .catch(() => {
          if (!cancelled) retryTimer = window.setTimeout(() => setRetry((value) => value + 1), 30_000);
        });
    }, 750);

    return () => {
      cancelled = true;
      window.clearTimeout(syncTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [progress, ready, retry]);

  return null;
}
