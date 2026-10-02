// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DailyCompletionDialog } from "../../../src/app/components/game/common/completion/DailyCompletionDialog";
import { DailyCompletionProvider } from "../../../src/app/components/game/common/completion/DailyCompletionProvider";
import { DailySummaryButton } from "../../../src/app/components/game/common/completion/DailySummaryButton";
import { apiClient } from "../../../src/lib/api/client";
import {
  formatDailyShare,
  hasNewDailyMilestone,
  mergeDailyMilestones,
  shareModifiers,
} from "../../../src/lib/domain/games/daily-completion";
import { mergeCloudProgress } from "../../../src/lib/domain/players/cloud-progress";
import { localProgressSchema } from "../../../src/lib/storage/local-progress-schema";
import {
  freshProgress,
  getSnapshot,
  initialiseProgress,
  replaceProgress,
} from "../../../src/lib/storage/local-progress-store";
import {
  dailyCompletionSchema,
  type DailyCompletionSummary,
  type DailyTier,
} from "../../../src/lib/validation/daily-completion";

const auth = vi.hoisted(() => ({
  user: null as { id: string; disabled: boolean } | null,
  loading: false,
}));
vi.mock("../../../src/app/components/auth/useAuth", () => ({ useAuth: () => auth }));
export function summary(tier: DailyTier | null = "normal", goat = false): DailyCompletionSummary {
  const result = (id: string, label: string) => ({
    id,
    label,
    completed: tier !== null,
    result: "3",
    modifiers: [],
  });
  return {
    challengeDate: "2026-09-30",
    sequenceNumber: null,
    requirementVersion: 1,
    groups: [
      {
        ...result("classic", "Classic"),
        results: [
          result("classic-llm", "LLM"),
          result("classic-cv", "CV"),
          result("classic-nlp", "NLP"),
          result("classic-od", "Object Detection"),
          result("classic-classical-ml", "Classical ML"),
          result("classic-filters", "Filters"),
        ],
      },
      { ...result("emoji", "Emoji"), results: [result("emoji", "Emoji")] },
      { ...result("timeline", "Timeline"), results: [result("timeline", "Timeline")] },
    ],
    highestCompletedTier: tier,
    allRequiredGamesComplete: tier !== null,
    hardcoreSweep: goat,
    highestCelebratedTier: null,
    goatSeen: false,
  };
}

beforeEach(() => {
  auth.user = null;
  initialiseProgress();
  replaceProgress(freshProgress());
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  replaceProgress(freshProgress());
});

describe("daily completion domain", () => {
  it("acknowledges progressive tiers and an independent GOAT presentation once", () => {
    expect(hasNewDailyMilestone(summary())).toBe(true);
    const normal = { highestCelebratedTier: "normal" as const, goatSeen: false };
    expect(hasNewDailyMilestone(summary(), normal)).toBe(false);
    expect(hasNewDailyMilestone(summary("challenge"), normal)).toBe(true);
    const hardcore = { highestCelebratedTier: "hardcore" as const, goatSeen: false };
    expect(hasNewDailyMilestone(summary("hardcore", true), hardcore)).toBe(true);
    expect(hasNewDailyMilestone(summary("hardcore", true), { ...hardcore, goatSeen: true })).toBe(
      false,
    );
    expect(hasNewDailyMilestone(summary(null))).toBe(false);
    expect(mergeDailyMilestones(hardcore, normal)).toEqual(hardcore);
    expect(mergeDailyMilestones()).toEqual({ highestCelebratedTier: null, goatSeen: false });
  });
  it("formats stable ordered results without answer metadata or invented ordinals", () => {
    expect(() => formatDailyShare(summary(null))).toThrow("verified complete");
    const verified = summary("hardcore", true);
    const share = formatDailyShare(verified);
    expect(share).toBe(
      `I completed all #aAIdle modes for 2026-09-30 👑🐐\n\n🧩 Classic\n  🤖 LLM: 3\n  👁️ CV: 3\n  💬 NLP: 3\n  🎯 Object Detection: 3\n  📊 Classical ML: 3\n  🧪 Filters: 3\n😀 Emoji: 3\n🕰️ Timeline: 3\n\nhttps://aaidle.com`,
    );
    expect(formatDailyShare({ ...verified, sequenceNumber: 123 })).toContain("for #123");
    const enriched = { ...verified, answerModelId: "never-shared", releaseDate: "1999-01-01" };
    expect(formatDailyShare(dailyCompletionSchema.parse(enriched))).not.toMatch(
      /never-shared|1999|answerModel/,
    );
    verified.groups[0]!.results[0]!.modifiers = ["earned", "unknown"];
    expect(
      formatDailyShare(verified, {
        earned: { id: "earned", emoji: "✓", accessibleLabel: "Explicit earned fact" },
      }),
    ).toContain("LLM: 3✓");
  });
  it("merges guest presentation monotonically into authenticated progress", () => {
    const current = {
      ...freshProgress(),
      dailyCompletion: {
        milestones: {
          "2026-09-30:1": { highestCelebratedTier: "challenge" as const, goatSeen: false },
        },
      },
    };
    const incoming = {
      ...freshProgress(),
      dailyCompletion: {
        milestones: {
          "2026-09-30:1": { highestCelebratedTier: "normal" as const, goatSeen: true },
        },
      },
    };
    expect(
      mergeCloudProgress(current, incoming).dailyCompletion?.milestones["2026-09-30:1"],
    ).toEqual({ highestCelebratedTier: "challenge", goatSeen: true });
  });
});

describe("daily completion dialog", () => {
  it("explains explicitly earned modifier IDs without inventing eligibility", () => {
    Object.assign(shareModifiers, {
      earned: { id: "earned", emoji: "✓", accessibleLabel: "Explicit recorded achievement" },
    });
    try {
      const verified = summary();
      verified.groups[0]!.results[0]!.modifiers = ["earned", "unknown"];
      render(<DailyCompletionDialog summary={verified} onClose={vi.fn()} onPresented={vi.fn()} />);
      expect(screen.getByText(/Explicit recorded achievement/)).toBeVisible();
    } finally {
      Reflect.deleteProperty(shareModifiers, "earned");
    }
  });
  it("focuses, traps focus and restores the opener when closed", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onPresented = vi.fn();
    const view = render(
      <DailyCompletionDialog summary={summary()} onClose={vi.fn()} onPresented={onPresented} />,
    );
    const close = screen.getByRole("button", { name: "Close daily summary" });
    expect(close).toHaveFocus();
    expect(onPresented).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: /^Close$/ })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(close).toHaveFocus();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
  it("keeps completion available after a clipboard failure and confirms success", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("denied"))
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: write },
    });
    render(
      <DailyCompletionDialog
        summary={summary("hardcore", true)}
        onClose={vi.fn()}
        onPresented={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy results" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy");
    expect(screen.getByRole("textbox")).toHaveValue(formatDailyShare(summary("hardcore", true)));
    fireEvent.click(screen.getByRole("button", { name: "Copy results" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Daily results copied");
    expect(screen.getByText(/GOAT achievement/)).toHaveTextContent(
      "every game completed at its highest difficulty",
    );
  });
  it("reveals the text summary when copying fails and stays open when its callback changes", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const first = vi.fn();
    const second = vi.fn();
    const view = render(
      <DailyCompletionDialog summary={summary()} onClose={vi.fn()} onPresented={first} />,
    );
    const details = view.container.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Copy results" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy");
    expect(details.open).toBe(true);
    const dialog = screen.getByRole("dialog");
    view.rerender(
      <DailyCompletionDialog summary={summary()} onClose={vi.fn()} onPresented={second} />,
    );
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog).toHaveAttribute("open");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});

describe("global milestone presentation", () => {
  it("opens only after a verified final completion, persists, and can reopen manually", async () => {
    const request = vi
      .spyOn(apiClient, "dailyCompletion")
      .mockResolvedValueOnce(summary(null))
      .mockResolvedValue(summary());
    const view = render(
      <MemoryRouter initialEntries={["/classic/llm"]}>
        <DailyCompletionProvider>
          <DailySummaryButton />
        </DailyCompletionProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    window.dispatchEvent(new Event("aaidle:game-progress"));
    expect(await screen.findByRole("dialog", { name: /normal daily set complete/i })).toBeVisible();
    expect(getSnapshot().dailyCompletion?.milestones["2026-09-30:1"].highestCelebratedTier).toBe(
      "normal",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close daily summary" }));
    view.unmount();
    render(
      <MemoryRouter initialEntries={["/classic/llm"]}>
        <DailyCompletionProvider>
          <DailySummaryButton />
        </DailyCompletionProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Daily summary" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
  });
  it("synchronizes legitimate guest celebrations after sign-in without reopening them", async () => {
    auth.user = { id: "u", disabled: false };
    replaceProgress({
      ...freshProgress(),
      dailyCompletion: {
        milestones: { "2026-09-30:1": { highestCelebratedTier: "normal", goatSeen: false } },
      },
    });
    vi.spyOn(apiClient, "dailyCompletion").mockResolvedValue(summary());
    const acknowledge = vi
      .spyOn(apiClient, "seeDailyCompletion")
      .mockResolvedValue({ ...summary(), highestCelebratedTier: "normal" });
    render(
      <MemoryRouter>
        <DailyCompletionProvider>
          <DailySummaryButton />
        </DailyCompletionProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(acknowledge).toHaveBeenCalledWith("20260930", {
        highestCelebratedTier: "normal",
        goatSeen: false,
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("celebrates on game pages only, including a past day completed today", async () => {
    const request = vi.spyOn(apiClient, "dailyCompletion").mockResolvedValue(summary());
    // A complete, unacknowledged day must not interrupt a page that is not a game
    for (const path of ["/", "/profile", "/login", "/privacy"]) {
      const view = render(
        <MemoryRouter initialEntries={[path]}>
          <DailyCompletionProvider>
            <DailySummaryButton />
          </DailyCompletionProvider>
        </MemoryRouter>,
      );
      expect(await screen.findByRole("button", { name: "Daily summary" })).toBeVisible();
      await new Promise((resolve) => setTimeout(resolve, 650));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(getSnapshot().dailyCompletion).toBeUndefined();
      view.unmount();
    }
    // A signed-in player finishing a past day gets the same celebration
    auth.user = { id: "u", disabled: false };
    vi.spyOn(apiClient, "seeDailyCompletion").mockResolvedValue(summary());
    request.mockClear();
    render(
      <MemoryRouter initialEntries={["/timeline/20260930"]}>
        <DailyCompletionProvider>
          <DailySummaryButton date="2026-09-30" />
        </DailyCompletionProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("dialog", { name: /normal daily set complete/i })).toBeVisible();
    expect(request).toHaveBeenCalledWith("20260930");
  });
  it("does not wait forever for a game celebration that never opens", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.spyOn(apiClient, "dailyCompletion").mockResolvedValue(summary());
      render(
        <MemoryRouter initialEntries={["/emoji"]}>
          <DailyCompletionProvider>
            <DailySummaryButton />
          </DailyCompletionProvider>
        </MemoryRouter>,
      );
      // A replayed winning request announces a celebration that will not be shown again
      window.dispatchEvent(new Event("aaidle:game-celebration-start"));
      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(screen.queryByRole("dialog")).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(3_000));
      expect(screen.getByRole("dialog", { name: /normal daily set complete/i })).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps stored progress when the remembered milestones are malformed", () => {
    const stored = { ...freshProgress(), dailyCompletion: { summaries: {}, milestones: "broken" } };
    const parsed = localProgressSchema.parse(stored);
    expect(parsed.dailyCompletion).toBeUndefined();
    expect(parsed.playerId).toBe(stored.playerId);
    // An older stored shape that still carried cached summaries is read without them
    const legacy = localProgressSchema.parse({
      ...freshProgress(),
      dailyCompletion: {
        summaries: { "2026-09-30:1": { anything: true } },
        milestones: { "2026-09-30:1": { highestCelebratedTier: "normal", goatSeen: false } },
      },
    });
    expect(legacy.dailyCompletion).toEqual({
      milestones: { "2026-09-30:1": { highestCelebratedTier: "normal", goatSeen: false } },
    });
  });
});
