import { Navigate, useParams } from "react-router-dom";
import { ClassicGame } from "@components/game/ClassicGame";
import { useAuth } from "@components/auth/useAuth";
import {
  classicCategoryFromRouteSegment,
  isClassicDifficulty,
} from "@lib/domain/models/model-types";

export default function ClassicPage() {
  const { category: routeCategory } = useParams();
  const category = classicCategoryFromRouteSegment(routeCategory);
  const { hardcoreUnlocked, user } = useAuth();
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
      key={`${category}:${difficulty}`}
      category={category}
      difficulty={difficulty}
      hasHardcoreAccess={category !== "hardcore" || Boolean(user && hardcoreUnlocked)}
    />
  );
}
