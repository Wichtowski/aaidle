import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { ClassicGame } from "@components/game";
import { useAuth } from "@components/auth/useAuth";
import {
  classicCategoryFromRouteSegment,
  isClassicDifficulty,
} from "@lib/domain/models/model-types";
import {
  gamePreferencesKey,
  readGamePreferences,
  saveClassicPreference,
} from "@lib/storage/game-preferences";

export default function ClassicPage() {
  const { category: routeCategory } = useParams();
  const savedPreferences = readGamePreferences();
  const hasLocalPreference =
    typeof window !== "undefined" &&
    typeof window.localStorage?.getItem === "function" &&
    window.localStorage.getItem(gamePreferencesKey) !== null;
  const legacyDifficulty =
    typeof document !== "undefined"
      ? document.cookie.match(/(?:^|; )aaidle_classic_difficulty=([^;]+)/)?.[1]
      : undefined;
  const saved = {
    ...savedPreferences.classic,
    difficulty:
      !hasLocalPreference && isClassicDifficulty(legacyDifficulty)
        ? legacyDifficulty
        : savedPreferences.classic.difficulty,
  };
  const routeCategoryValue = classicCategoryFromRouteSegment(routeCategory);
  const category = routeCategoryValue ?? saved.category;
  const { hardcoreUnlocked, user } = useAuth();
  const difficulty =
    category === "hardcore"
      ? "hardcore"
      : isClassicDifficulty(saved.difficulty) && saved.difficulty !== "hardcore"
        ? saved.difficulty
        : "normal";
  useEffect(() => {
    saveClassicPreference(category, difficulty);
  }, [category, difficulty]);
  return (
    <ClassicGame
      key={category === "hardcore" ? "hardcore" : "classic"}
      category={category}
      difficulty={difficulty}
      hasHardcoreAccess={category !== "hardcore" || Boolean(user && hardcoreUnlocked)}
    />
  );
}
