import type { ClassicCategory, ClassicDifficulty } from "../domain/models/model-types";

const howToPlayPreferencesKey = "aaidle:how-to-play:v1";

function gameKey(category: ClassicCategory, difficulty: ClassicDifficulty) {
  return `classic:${category}:${difficulty}`;
}

function readSeenGames(): Record<string, boolean> {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return {};
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(howToPlayPreferencesKey) ?? "null");
    if (!value || typeof value !== "object") return {};
    const seenGames: Record<string, boolean> = {};
    for (const [key, seen] of Object.entries(value)) {
      if (key.length > 0 && seen === true) seenGames[key] = true;
    }
    return seenGames;
  } catch {
    return {};
  }
}

export function hasSeenClassicHowToPlay(
  category: ClassicCategory,
  difficulty: ClassicDifficulty,
  legacySeen: boolean,
) {
  return legacySeen || readSeenGames()[gameKey(category, difficulty)] === true;
}

export function markClassicHowToPlaySeen(category: ClassicCategory, difficulty: ClassicDifficulty) {
  if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function") {
    return;
  }

  window.localStorage.setItem(
    howToPlayPreferencesKey,
    JSON.stringify({ ...readSeenGames(), [gameKey(category, difficulty)]: true }),
  );
}
