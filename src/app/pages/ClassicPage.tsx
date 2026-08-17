import { Navigate, useParams } from "react-router-dom";
import { ClassicGame } from "@components/game/ClassicGame";
import { useAuth } from "@components/auth/useAuth";
import {
  classicCategoryFromRouteSegment,
  isClassicDifficulty,
} from "@lib/domain/models/model-types";
import { useLocalProgress } from "@lib/storage/use-local-progress";

export default function ClassicPage() {
  const { category: routeCategory } = useParams();
  const category = classicCategoryFromRouteSegment(routeCategory);
  const progress = useLocalProgress();
  const { user } = useAuth();
  if (!category) return <Navigate replace to="/classic/llm" />;
  const saved = document.cookie.match(/(?:^|; )aaidle_classic_difficulty=([^;]+)/)?.[1];
  const difficulty =
    category === "hardcore"
      ? "hardcore"
      : isClassicDifficulty(saved) && saved !== "hardcore"
        ? saved
        : "normal";
  return (
    <ClassicGame
      category={category}
      difficulty={difficulty}
      hasHardcoreAccess={
        category !== "hardcore" || Boolean(user && progress.preferences.hardcoreUnlocked)
      }
    />
  );
}
