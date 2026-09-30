import type {
  DailyCompletionSummary,
  DailyMilestone,
  DailyTier,
} from "../../validation/daily-completion";

export const dailyTierRank = (tier: DailyTier | null | undefined) =>
  tier === "hardcore" ? 3 : tier === "challenge" ? 2 : tier === "normal" ? 1 : 0;
export const dailyMilestoneKey = (summary: DailyCompletionSummary) =>
  `${summary.challengeDate}:${summary.requirementVersion}`;
export const dailySymbols = (summary: DailyCompletionSummary) =>
  (summary.highestCompletedTier === "hardcore"
    ? "👑"
    : summary.highestCompletedTier === "challenge"
      ? "🏆"
      : "🏅") + (summary.hardcoreSweep ? "🐐" : "");

export function mergeDailyMilestones(a?: DailyMilestone, b?: DailyMilestone): DailyMilestone {
  return {
    highestCelebratedTier:
      dailyTierRank(a?.highestCelebratedTier) > dailyTierRank(b?.highestCelebratedTier)
        ? a!.highestCelebratedTier
        : (b?.highestCelebratedTier ?? null),
    goatSeen: Boolean(a?.goatSeen || b?.goatSeen),
  };
}

export function hasNewDailyMilestone(summary: DailyCompletionSummary, saved?: DailyMilestone) {
  const seen = mergeDailyMilestones(saved, summary);
  return (
    summary.allRequiredGamesComplete &&
    summary.highestCompletedTier !== null &&
    (dailyTierRank(summary.highestCompletedTier) > dailyTierRank(seen.highestCelebratedTier) ||
      (summary.hardcoreSweep && !seen.goatSeen))
  );
}

export type ShareModifier = { id: string; emoji: string; accessibleLabel: string };
// Owners must define eligibility and persist an earned ID before adding its presentation here.
export const shareModifiers: Readonly<Record<string, ShareModifier>> = {};
const groupIcons: Readonly<Record<string, string>> = {
  classic: "🧩",
  emoji: "😀",
  timeline: "🕰️",
  logo: "🖼️",
};
const resultIcons: Readonly<Record<string, string>> = {
  "classic-llm": "🤖",
  "classic-cv": "👁️",
  "classic-nlp": "💬",
  "classic-od": "🎯",
  "classic-classical-ml": "📊",
  "classic-filters": "🧪",
  "classic-hardcore": "👑",
};

export function formatDailyShare(summary: DailyCompletionSummary, modifiers = shareModifiers) {
  if (!summary.allRequiredGamesComplete || !summary.highestCompletedTier)
    throw new Error("A verified complete daily set is required.");
  const day =
    summary.sequenceNumber === null ? summary.challengeDate : `#${summary.sequenceNumber}`;
  const lines = [`I completed all #aAIdle modes for ${day} ${dailySymbols(summary)}`, ""];
  const suffix = (ids: string[]) =>
    ids.flatMap((id) => (modifiers[id] ? [modifiers[id]!.emoji] : [])).join("");
  for (const group of summary.groups) {
    if (group.id === "classic" || group.results.length > 1) {
      lines.push(`${groupIcons[group.id] ?? "🎮"} ${group.label}`);
      for (const result of group.results)
        lines.push(
          `  ${resultIcons[result.id] ?? "•"} ${result.label}: ${result.result}${suffix(result.modifiers)}`,
        );
    } else {
      lines.push(
        `${groupIcons[group.id] ?? "🎮"} ${group.label}: ${group.result}${suffix([...new Set([...group.modifiers, ...group.results.flatMap((result) => result.modifiers)])])}`,
      );
    }
  }
  lines.push("", "https://aaidle.com");
  return lines.join("\n");
}
