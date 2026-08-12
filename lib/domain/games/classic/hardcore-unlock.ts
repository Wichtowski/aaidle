import { focusedClassicCategories } from "../../models/model-types";
import type { LocalProgress } from "../../../storage/local-progress-schema";

export const hardcoreUnlockCode = "666";

export function solvedChallengeCategoriesForDate(progress: LocalProgress, date: string) {
  return focusedClassicCategories.filter((category) =>
    Object.values(progress.games).some(
      (game) =>
        game.challengeDate === date &&
        game.mode === `classic:${category}:challenge` &&
        game.status === "solved",
    ),
  );
}

export function hasCompletedChallengeRitual(progress: LocalProgress, date: string) {
  return solvedChallengeCategoriesForDate(progress, date).length === focusedClassicCategories.length;
}
