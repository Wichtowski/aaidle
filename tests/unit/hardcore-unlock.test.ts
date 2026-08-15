import { describe, expect, it } from "vitest";
import {
  hasCompletedChallengeRitual,
  solvedChallengeCategoriesForDate,
} from "../../lib/domain/games/classic/hardcore-unlock";
import { freshProgress } from "../../lib/storage/local-progress-store";
import {
  classicChallengeMode,
  focusedClassicCategories,
} from "../../lib/domain/models/model-types";

describe("Hardcore unlock ritual", () => {
  it("requires all focused Challenge categories on the same date", () => {
    const progress = freshProgress();
    const date = "2026-08-12";

    for (const category of focusedClassicCategories) {
      progress.games[`${classicChallengeMode(category, "challenge")}:${date}`] = {
        challengeId: category,
        challengeDate: date,
        mode: classicChallengeMode(category, "challenge"),
        status: "solved",
        guesses: [],
        startedAt: `${date}T00:00:00.000Z`,
        completedAt: `${date}T00:00:00.000Z`,
      };
    }

    expect(solvedChallengeCategoriesForDate(progress, date)).toEqual(focusedClassicCategories);
    expect(hasCompletedChallengeRitual(progress, date)).toBe(true);
    expect(hasCompletedChallengeRitual(progress, "2026-08-11")).toBe(false);
  });
});
