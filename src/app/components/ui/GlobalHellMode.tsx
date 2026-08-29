"use client";

import { useLayoutEffect } from "react";
import { useAuth } from "../auth/useAuth";
import { useLocalProgress } from "@lib/storage/use-local-progress";

export function GlobalHellMode() {
  const { hardcoreUnlocked, user } = useAuth();
  const progress = useLocalProgress();
  const enabled = Boolean(user && hardcoreUnlocked && progress.preferences.hellMode);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("hell-mode", enabled);
    document.body.classList.toggle("hell-mode", enabled);
    return () => {
      document.documentElement.classList.remove("hell-mode");
      document.body.classList.remove("hell-mode");
    };
  }, [enabled]);

  return null;
}
