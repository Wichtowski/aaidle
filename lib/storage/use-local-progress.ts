"use client";
import { useEffect, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  initialiseProgress,
  subscribe,
} from "./local-progress-store";
export function useLocalProgress() {
  useEffect(() => {
    initialiseProgress();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
