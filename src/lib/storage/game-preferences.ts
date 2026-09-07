import {
  classicCategories,
  classicDifficulties,
  type ClassicCategory,
  type ClassicDifficulty,
} from "../domain/models/model-types";
import {
  timelineDifficulties,
  type TimelineDifficulty,
} from "../domain/games/timeline/timeline-types";
import type { EmojiDifficulty } from "../api/client";

export const gamePreferencesKey = "aaidle:game-preferences:v1";

export type GamePreferences = {
  classic: { category: ClassicCategory; difficulty: ClassicDifficulty };
  emoji: EmojiDifficulty;
  timeline: TimelineDifficulty;
  logo: "normal";
};

const defaults: GamePreferences = {
  classic: { category: "llm", difficulty: "normal" },
  emoji: "normal",
  timeline: "normal",
  logo: "normal",
};

const isClassicCategory = (value: unknown): value is ClassicCategory =>
  typeof value === "string" && classicCategories.includes(value as ClassicCategory);
const isClassicDifficulty = (value: unknown): value is ClassicDifficulty =>
  typeof value === "string" && classicDifficulties.includes(value as ClassicDifficulty);
const isTimelineDifficulty = (value: unknown): value is TimelineDifficulty =>
  typeof value === "string" && timelineDifficulties.includes(value as TimelineDifficulty);

export function readGamePreferences(): GamePreferences {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return defaults;
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(gamePreferencesKey) ?? "null") as {
      classic?: { category?: unknown; difficulty?: unknown };
      emoji?: unknown;
      timeline?: unknown;
    } | null;
    return {
      classic: {
        category: isClassicCategory(value?.classic?.category)
          ? value.classic.category
          : defaults.classic.category,
        difficulty: isClassicDifficulty(value?.classic?.difficulty)
          ? value.classic.difficulty
          : defaults.classic.difficulty,
      },
      emoji:
        value?.emoji === "normal" || value?.emoji === "challenge" || value?.emoji === "hardcore"
          ? value.emoji
          : defaults.emoji,
      timeline: isTimelineDifficulty(value?.timeline) ? value.timeline : defaults.timeline,
      logo: "normal",
    };
  } catch {
    return defaults;
  }
}

export function updateGamePreferences(mutator: (preferences: GamePreferences) => GamePreferences) {
  if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function") return;
  const next = mutator(readGamePreferences());
  window.localStorage.setItem(gamePreferencesKey, JSON.stringify(next));
}

export function saveClassicPreference(category: ClassicCategory, difficulty: ClassicDifficulty) {
  updateGamePreferences((preferences) => ({ ...preferences, classic: { category, difficulty } }));
}

export function saveEmojiDifficulty(difficulty: EmojiDifficulty) {
  updateGamePreferences((preferences) => ({ ...preferences, emoji: difficulty }));
}

export function saveTimelineDifficulty(difficulty: TimelineDifficulty) {
  updateGamePreferences((preferences) => ({ ...preferences, timeline: difficulty }));
}
