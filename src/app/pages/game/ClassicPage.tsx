import { useEffect } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ClassicGame } from "@components/game";
import { useAuth } from "@components/auth/useAuth";
import { GameLoadingState } from "@components/ui/GameLoadingState";
import {
  classicCategoryFromRouteSegment,
  isClassicDifficulty,
} from "@lib/domain/models/model-types";
import {
  gamePreferencesKey,
  readGamePreferences,
  saveClassicPreference,
} from "@lib/storage/game-preferences";

export function ClassicPage() {
  const { category: routeCategory } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
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
  const { hardcoreAccessLoading, hardcoreUnlocked, loading, user } = useAuth();
  const hasHardcoreAccess = Boolean(user && hardcoreUnlocked);
  const hasSavedHardcoreRoute = !routeCategoryValue && saved.category === "hardcore";
  const hardcoreAccessPending = loading || Boolean(user && hardcoreAccessLoading);
  const category =
    hasSavedHardcoreRoute && !hasHardcoreAccess ? "llm" : (routeCategoryValue ?? saved.category);
  const difficulty =
    category === "hardcore"
      ? "hardcore"
      : isClassicDifficulty(saved.difficulty) && saved.difficulty !== "hardcore"
        ? saved.difficulty
        : "normal";
  useEffect(() => {
    const transition = new URLSearchParams(location.search).get("transition");
    if (transition !== "classic") return;

    document.body.classList.add("classic-page-transitioning");
    const frame = window.requestAnimationFrame(() => {
      document.body.classList.add("classic-page-transitioning--fading");
      document.body.classList.remove("classic-page-transitioning");
    });
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(location.search);
      params.delete("transition");
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : "",
        },
        { replace: true },
      );
    }, 650);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.classList.remove(
        "classic-page-transitioning",
        "classic-page-transitioning--fading",
      );
      window.clearTimeout(timer);
    };
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (hasSavedHardcoreRoute && hardcoreAccessPending) return;
    saveClassicPreference(category, difficulty);
  }, [category, difficulty, hardcoreAccessPending, hasSavedHardcoreRoute]);
  if (hasSavedHardcoreRoute && hardcoreAccessPending) {
    return (
      <main className="page">
        <GameLoadingState label="Checking your account…" />
      </main>
    );
  }
  if (!routeCategoryValue && category === "hardcore") {
    return <Navigate replace to="/classic/hardcore" />;
  }
  return (
    <ClassicGame
      key={category === "hardcore" ? "hardcore" : "classic"}
      category={category}
      difficulty={difficulty}
      hasHardcoreAccess={category !== "hardcore" || hasHardcoreAccess}
    />
  );
}
