import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

// Only a game page can complete the daily set, so only game pages celebrate and poll
const gameRoute = /^\/(?:classic|emoji|timeline|logo)(?:\/|$)/;
// How long the summary waits for a game's own celebration to open after a win
const gameDialogGraceMs = 4_000;

type RefreshMode = "manual" | "celebrate" | "quiet";

// The part of a locally remembered milestone the server can confirm for this summary
function verifiedMilestone(local: DailyMilestone, server: DailyCompletionSummary): DailyMilestone {
  return {
    highestCelebratedTier:
      dailyTierRank(local.highestCelebratedTier) <= dailyTierRank(server.highestCompletedTier)
        ? local.highestCelebratedTier
        : server.highestCompletedTier,
    goatSeen: local.goatSeen && server.hardcoreSweep,
  };
}

const isAheadOfServer = (milestone: DailyMilestone, server: DailyCompletionSummary) =>
  dailyTierRank(milestone.highestCelebratedTier) > dailyTierRank(server.highestCelebratedTier) ||
  (milestone.goatSeen && !server.goatSeen);

export function DailyCompletionProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const progress = useLocalProgress();
  const location = useLocation();
  const selectedDate =
    /^\/(?:classic\/[^/]+|emoji|timeline|logo)\/(\d{8})$/.exec(location.pathname)?.[1] ?? "today";
  const onGameRoute = gameRoute.test(location.pathname);
  const [summary, setSummary] = useState<DailyCompletionSummary | null>(null);
  const [opened, setOpened] = useState<DailyCompletionSummary | null>(null);
  const [pending, setPending] = useState<DailyCompletionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const awaitingGameDialogUntil = useRef(0);
  const generation = useRef(0);
  const synchronized = useRef(new Set<string>());
  useEffect(() => {
    awaitingGameDialogUntil.current = 0;
  }, [location.key]);
  useEffect(() => {
    // A win is normally followed by the game's own celebration. When that never opens,
    // for example on a replayed request, the daily summary must not wait forever
    const start = () => {
      awaitingGameDialogUntil.current = Date.now() + gameDialogGraceMs;
    };
    const finish = () => {
      awaitingGameDialogUntil.current = 0;
    };
    window.addEventListener("aaidle:game-celebration-start", start);
    window.addEventListener("aaidle:game-celebration-finished", finish);
    return () => {
      window.removeEventListener("aaidle:game-celebration-start", start);
      window.removeEventListener("aaidle:game-celebration-finished", finish);
    };
  }, []);
  const refresh = useCallback(
    async (date = "today", mode: RefreshMode = "quiet") => {
      const request = ++generation.current;
      try {
        let fresh = await apiClient.dailyCompletion(date);
        if (request !== generation.current) return;
        const local = getSnapshot().dailyCompletion?.milestones[dailyMilestoneKey(fresh)];
        if (user && local && isAheadOfServer(local, fresh)) {
          fresh = await apiClient.seeDailyCompletion(
            fresh.challengeDate.replaceAll("-", ""),
            verifiedMilestone(local, fresh),
          );
          if (request !== generation.current) return;
        }
        setSummary(fresh);
        if (mode === "manual") {
          setPending(null);
          if (fresh.allRequiredGamesComplete) setOpened(fresh);
        } else {
          setPending(mode === "celebrate" && hasNewDailyMilestone(fresh, local) ? fresh : null);
        }
      } catch {
        if (mode === "manual") setError("Daily summary is unavailable. Please try again.");
      }
    },
    [user],
  );
  useEffect(() => {
    generation.current += 1;
    setPending(null);
    setOpened(null);
    setSummary(null);
    if (loading || user?.disabled || (selectedDate !== "today" && !user)) return;
    const mode: RefreshMode = onGameRoute ? "celebrate" : "quiet";
    void refresh(selectedDate, mode);
    const reload = () => {
      if (!document.hidden) void refresh(selectedDate, mode);
    };
    const timer = onGameRoute ? window.setInterval(reload, 60_000) : null;
    window.addEventListener("aaidle:game-progress", reload);
    window.addEventListener("focus", reload);
    return () => {
      generation.current += 1;
      if (timer !== null) clearInterval(timer);
      window.removeEventListener("aaidle:game-progress", reload);
      window.removeEventListener("focus", reload);
    };
  }, [loading, user?.id, progress.playerId, refresh, selectedDate, onGameRoute]);
  const milestones = progress.dailyCompletion?.milestones;
  useEffect(() => {
    if (!user || loading || user.disabled) return;
    const controller = new AbortController();
    const synchronize = async () => {
      for (const [key, milestone] of Object.entries(milestones ?? {})) {
        const token = `${user.id}:${key}:${milestone.highestCelebratedTier}:${milestone.goatSeen}`;
        if (synchronized.current.has(token)) continue;
        if (controller.signal.aborted) return;
        try {
          const date = key.split(":")[0]!.replaceAll("-", "");
          const server = await apiClient.dailyCompletion(date, controller.signal);
          if (controller.signal.aborted) return;
          // Requirement versions are different milestones, not interchangeable.
          if (dailyMilestoneKey(server) === key) {
            const legitimate = verifiedMilestone(milestone, server);
            if (isAheadOfServer(legitimate, server)) {
              await apiClient.seeDailyCompletion(date, legitimate);
            }
          }
          synchronized.current.add(token);
        } catch {
          /* Retry after the next server-confirmed progress change or navigation. */
        }
      }
    };
    void synchronize();
    return () => controller.abort();
  }, [user, loading, milestones, progress.playerId]);
  useEffect(() => {
    if (!pending || opened) return;
    const timer = window.setInterval(() => {
      if (
        Date.now() < awaitingGameDialogUntil.current ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      ) {
        return;
      }
      setPending(null);
      setOpened(pending);
    }, 500);
    return () => clearInterval(timer);
  }, [opened, pending]);
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
        milestones: {
          ...state.dailyCompletion?.milestones,
          [key]: mergeDailyMilestones(state.dailyCompletion?.milestones[key], seen),
        },
      },
    }));
    if (user) {
      void apiClient
        .seeDailyCompletion(opened.challengeDate.replaceAll("-", ""), seen)
        .catch(() => undefined);
    }
  }, [opened, user]);
  const context = useMemo(
    () => ({
      summary,
      reopen: (date?: string) => {
        void refresh(date, "manual");
      },
    }),
    [refresh, summary],
  );
  return (
    <DailyCompletionContext.Provider value={context}>
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
