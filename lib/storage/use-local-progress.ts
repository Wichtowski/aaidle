"use client";
import { useEffect, useSyncExternalStore } from "react";
import {
  getInitialisedSnapshot,
  getServerInitialisedSnapshot,
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

export function useLocalProgressReady() {
  return useSyncExternalStore(subscribe, getInitialisedSnapshot, getServerInitialisedSnapshot);
}
