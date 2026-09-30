import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../../auth/useAuth";
import { useLocation } from "react-router-dom";
import { apiClient } from "@lib/api/client";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { getSnapshot, updateProgress } from "@lib/storage/local-progress-store";
import {
  dailyMilestoneKey,
  dailyTierRank,
  hasNewDailyMilestone,
  mergeDailyMilestones,
} from "@lib/domain/games/daily-completion";
import type { DailyCompletionSummary, DailyMilestone } from "@lib/validation/daily-completion";
import { DailyCompletionDialog } from "./DailyCompletionDialog";
import { DailyCompletionContext } from "./daily-completion-context";
import { Toast } from "../../../ui/Toast";

export function DailyCompletionProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const progress = useLocalProgress();
  const location = useLocation();
  const selectedDate =
    /^\/(?:classic\/[^/]+|emoji|timeline|logo)\/(\d{8})$/.exec(location.pathname)?.[1] ?? "today";
  const [summary, setSummary] = useState<DailyCompletionSummary | null>(null);
  const [opened, setOpened] = useState<DailyCompletionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<DailyCompletionSummary | null>(null);
  const awaitingGameDialog = useRef(false);
  const generation = useRef(0);
  const synchronized = useRef(new Set<string>());
  useEffect(() => {
    awaitingGameDialog.current = false;
  }, [location.key]);
  useEffect(() => {
    const start = () => {
      awaitingGameDialog.current = true;
    };
    const finish = () => {
      awaitingGameDialog.current = false;
    };
    window.addEventListener("aaidle:game-celebration-start", start);
    window.addEventListener("aaidle:game-celebration-finished", finish);
    return () => {
      window.removeEventListener("aaidle:game-celebration-start", start);
      window.removeEventListener("aaidle:game-celebration-finished", finish);
    };
  }, []);
  const refresh = useCallback(
    async (date = "today", manual = false) => {
      const request = ++generation.current;
      try {
        let fresh = await apiClient.dailyCompletion(date);
        if (request !== generation.current) return;
        const key = dailyMilestoneKey(fresh);
        const local = getSnapshot().dailyCompletion?.milestones[key];
        if (
          user &&
          local &&
          (dailyTierRank(local.highestCelebratedTier) >
            dailyTierRank(fresh.highestCelebratedTier) ||
            (local.goatSeen && !fresh.goatSeen))
        ) {
          const legitimate: DailyMilestone = {
            highestCelebratedTier:
              dailyTierRank(local.highestCelebratedTier) <=
              dailyTierRank(fresh.highestCompletedTier)
                ? local.highestCelebratedTier
                : fresh.highestCompletedTier,
            goatSeen: local.goatSeen && fresh.hardcoreSweep,
          };
          fresh = await apiClient.seeDailyCompletion(
            fresh.challengeDate.replaceAll("-", ""),
            legitimate,
          );
          if (request !== generation.current) return;
        }
        setSummary(fresh);
        updateProgress((state) => ({
          ...state,
          dailyCompletion: {
            summaries: { ...state.dailyCompletion?.summaries, [key]: fresh },
            milestones: { ...state.dailyCompletion?.milestones },
          },
        }));
        if (manual && fresh.allRequiredGamesComplete) setOpened(fresh);
        else if (hasNewDailyMilestone(fresh, local)) pending.current = fresh;
        else pending.current = null;
      } catch {
        if (manual) setError("Daily summary is unavailable. Please try again.");
      }
    },
    [user],
  );
  useEffect(() => {
    generation.current += 1;
    pending.current = null;
    setOpened(null);
    setSummary(null);
    if (loading || user?.disabled || (selectedDate !== "today" && !user)) return;
    void refresh(selectedDate);
    const reload = () => {
      void refresh(selectedDate);
    };
    const timer = window.setInterval(reload, 60_000);
    window.addEventListener("aaidle:game-progress", reload);
    window.addEventListener("focus", reload);
    return () => {
      generation.current += 1;
      clearInterval(timer);
      window.removeEventListener("aaidle:game-progress", reload);
      window.removeEventListener("focus", reload);
    };
  }, [loading, user?.id, progress.playerId, refresh, selectedDate]);
  useEffect(() => {
    if (!user || loading || user.disabled) return;
    const controller = new AbortController();
    const synchronize = async () => {
      for (const [key, milestone] of Object.entries(progress.dailyCompletion?.milestones ?? {})) {
        const token = `${user.id}:${key}:${milestone.highestCelebratedTier}:${milestone.goatSeen}`;
        if (synchronized.current.has(token) || controller.signal.aborted) continue;
        try {
          const date = key.split(":")[0]!.replaceAll("-", "");
          const server = await apiClient.dailyCompletion(date, controller.signal);
          // Requirement versions are different milestones, not interchangeable.
          if (dailyMilestoneKey(server) !== key) continue;
          const legitimate = {
            highestCelebratedTier:
              dailyTierRank(milestone.highestCelebratedTier) <=
              dailyTierRank(server.highestCompletedTier)
                ? milestone.highestCelebratedTier
                : server.highestCompletedTier,
            goatSeen: milestone.goatSeen && server.hardcoreSweep,
          };
          if (controller.signal.aborted) return;
          await apiClient.seeDailyCompletion(date, legitimate);
          synchronized.current.add(token);
        } catch {
          /* Retry after the next server-confirmed progress change or navigation. */
        }
      }
    };
    void synchronize();
    return () => controller.abort();
  }, [user, loading, progress.dailyCompletion?.milestones, progress.playerId]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = pending.current;
      if (
        !next ||
        opened ||
        awaitingGameDialog.current ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      )
        return;
      pending.current = null;
      setOpened(next);
    }, 500);
    return () => clearInterval(timer);
  }, [opened]);
  const presented = useCallback(() => {
    if (!opened) return;
    const key = dailyMilestoneKey(opened);
    const seen = {
      highestCelebratedTier: opened.highestCompletedTier,
      goatSeen: opened.hardcoreSweep,
    };
    updateProgress((state) => ({
      ...state,
      dailyCompletion: {
        summaries: { ...state.dailyCompletion?.summaries, [key]: opened },
        milestones: {
          ...state.dailyCompletion?.milestones,
          [key]: mergeDailyMilestones(state.dailyCompletion?.milestones[key], seen),
        },
      },
    }));
    if (user)
      void apiClient
        .seeDailyCompletion(opened.challengeDate.replaceAll("-", ""), seen)
        .catch(() => undefined);
  }, [opened, user]);
  return (
    <DailyCompletionContext.Provider
      value={{
        summary,
        reopen: (date) => {
          void refresh(date, true);
        },
      }}
    >
      {children}
      {opened && (
        <DailyCompletionDialog
          key={dailyMilestoneKey(opened)}
          summary={opened}
          onClose={() => setOpened(null)}
          onPresented={presented}
        />
      )}
      <Toast message={error} variant="error" onDismiss={() => setError(null)} />
    </DailyCompletionContext.Provider>
  );
}
