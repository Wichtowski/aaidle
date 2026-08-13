"use client";

import { useEffect } from "react";
import { useLocalProgress } from "../../../lib/storage/use-local-progress";

export function GlobalHellMode() {
  const progress = useLocalProgress();
  const enabled = progress.preferences.hardcoreUnlocked && progress.preferences.hellMode;

  useEffect(() => {
    document.body.classList.toggle("hell-mode", enabled);
    return () => document.body.classList.remove("hell-mode");
  }, [enabled]);

  return null;
}
