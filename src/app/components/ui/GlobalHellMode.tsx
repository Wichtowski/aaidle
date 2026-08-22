"use client";

import { useEffect, useLayoutEffect, useState } from "react";

const hellModeStorageKey = "aaidle:hell-mode:v1";

function savedHellMode(): boolean {
  if (typeof window === "undefined") return false;

  return window.localStorage.getItem(hellModeStorageKey) === "1";
}

export function GlobalHellMode() {
  const [enabled, setEnabled] = useState(savedHellMode);

  useLayoutEffect(() => {
    const sync = () => setEnabled(savedHellMode());
    window.addEventListener("storage", sync);
    window.addEventListener("aaidle:hell-mode-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("aaidle:hell-mode-change", sync);
    };
  }, []);

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
