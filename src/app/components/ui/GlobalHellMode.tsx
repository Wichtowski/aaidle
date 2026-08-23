"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";

const hellModeStorageKey = "aaidle:hell-mode:v1";

function savedHellMode(): boolean {
  if (typeof window === "undefined") return false;

  return window.localStorage.getItem(hellModeStorageKey) === "1";
}

export function GlobalHellMode() {
  const { hardcoreUnlocked, user } = useAuth();
  const [enabled, setEnabled] = useState(false);

  useLayoutEffect(() => {
    const sync = () => setEnabled(Boolean(user && hardcoreUnlocked && savedHellMode()));
    window.addEventListener("storage", sync);
    window.addEventListener("aaidle:hell-mode-change", sync);
    sync();
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("aaidle:hell-mode-change", sync);
    };
  }, [hardcoreUnlocked, user]);

  useEffect(() => {
    document.documentElement.classList.toggle("hell-mode", enabled);
    document.body.classList.toggle("hell-mode", enabled);
    return () => {
      document.documentElement.classList.remove("hell-mode");
      document.body.classList.remove("hell-mode");
    };
  }, [enabled]);

  return null;
}
