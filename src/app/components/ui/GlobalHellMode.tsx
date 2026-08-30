"use client";

import { useLayoutEffect } from "react";
import { useAuth } from "../auth/useAuth";
import { hellModeActiveKey } from "@lib/storage/local-progress-store";
import { useLocalProgress } from "@lib/storage/use-local-progress";

export function GlobalHellMode() {
  const { hardcoreAccessLoading, hardcoreUnlocked, loading, user } = useAuth();
  const progress = useLocalProgress();
  const enabled = Boolean(user && hardcoreUnlocked && progress.preferences.hellMode);

  useLayoutEffect(() => {
    if (loading || hardcoreAccessLoading) return;

    document.documentElement.classList.toggle("hell-mode", enabled);
    document.body.classList.toggle("hell-mode", enabled);
    try {
      if (enabled) {
        window.localStorage.setItem(hellModeActiveKey, "true");
      } else {
        window.localStorage.removeItem(hellModeActiveKey);
      }
    } catch {
      // The DOM theme remains authoritative when storage is unavailable
    }
    return () => {
      document.documentElement.classList.remove("hell-mode");
      document.body.classList.remove("hell-mode");
    };
  }, [enabled, hardcoreAccessLoading, loading]);

  return null;
}
