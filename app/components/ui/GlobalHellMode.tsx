"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useLocalProgress, useLocalProgressReady } from "../../../lib/storage/use-local-progress";

const hellModeCookieName = "aaidle_hell_mode";
const hellModeStorageKey = "aaidle:hell-mode:v1";

function savedHellMode(): boolean | null {
  if (typeof window === "undefined") return null;

  const value = window.localStorage.getItem(hellModeStorageKey);
  if (value === null) return null;
  return value === "1";
}

export function GlobalHellMode() {
  const progress = useLocalProgress();
  const ready = useLocalProgressReady();
  const [appearanceEnabled, setAppearanceEnabled] = useState<boolean | null>(null);
  const enabled =
    appearanceEnabled ?? (progress.preferences.hardcoreUnlocked && progress.preferences.hellMode);

  useLayoutEffect(() => {
    setAppearanceEnabled(savedHellMode());
  }, [progress.preferences.hellMode]);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("hell-mode", enabled);
    document.body.classList.toggle("hell-mode", enabled);
    document.cookie = [
      `${hellModeCookieName}=${enabled ? "1" : "0"}`,
      "Path=/",
      "Max-Age=31536000",
      "SameSite=Lax",
    ].join("; ");
    return () => {
      document.documentElement.classList.remove("hell-mode");
      document.body.classList.remove("hell-mode");
    };
  }, [enabled, ready]);

  return null;
}
